import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Construct } from "constructs";

export interface ApiStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  albSg: ec2.SecurityGroup;
  apiSg: ec2.SecurityGroup;
  dbInstance: rds.DatabaseInstance;
  dbSecret: rds.DatabaseSecret;
  urlExtractionQueue: sqs.Queue;
  claimPipelineQueue: sqs.Queue;
  openaiApiKeySecret: secretsmanager.Secret;
  anthropicApiKeySecret: secretsmanager.Secret;
}

export class ApiStack extends cdk.Stack {
  public readonly albDnsName: string;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const cluster = new ecs.Cluster(this, "EpistemeCluster", {
      vpc: props.vpc,
      // containerInsightsV2 is supported at runtime but types lag behind
      containerInsightsV2: ecs.ContainerInsights.ENHANCED,
    } as ecs.ClusterProps);

    const taskDef = new ecs.FargateTaskDefinition(this, "ApiTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    // IAM permissions
    props.urlExtractionQueue.grantSendMessages(taskDef.taskRole);
    props.urlExtractionQueue.grantConsumeMessages(taskDef.taskRole);
    props.claimPipelineQueue.grantSendMessages(taskDef.taskRole);
    props.claimPipelineQueue.grantConsumeMessages(taskDef.taskRole);
    props.dbSecret.grantRead(taskDef.taskRole);
    props.openaiApiKeySecret.grantRead(taskDef.taskRole);
    props.anthropicApiKeySecret.grantRead(taskDef.taskRole);

    const container = taskDef.addContainer("api", {
      image: ecs.ContainerImage.fromAsset("..", {
        platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
      }),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "episteme-api" }),
      environment: {
        ENVIRONMENT: "production",
        PORT: "3000",
        HOST: "0.0.0.0",
        DB_HOST: props.dbInstance.dbInstanceEndpointAddress,
        DB_PORT: props.dbInstance.dbInstanceEndpointPort,
        DB_NAME: "episteme",
        SQS_URL_EXTRACTION_QUEUE: props.urlExtractionQueue.queueUrl,
        SQS_CLAIM_PIPELINE_QUEUE: props.claimPipelineQueue.queueUrl,
        LLM_HOURLY_CALL_LIMIT: "500",
        LLM_DAILY_CALL_LIMIT: "5000",
        // Fan-out caps (0 = unlimited). Bound graph size and LLM spend per
        // document — without these, one long post explodes into hundreds of
        // claims and blows the daily call budget. Tune up later for thoroughness.
        EXTRACTION_MAX_CLAIMS: "8",
        MAX_DECOMPOSITION_DEPTH: "2",
        MAX_SUBCLAIMS_PER_CLAIM: "4",
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(props.dbSecret, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, "password"),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(
          props.openaiApiKeySecret
        ),
        ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(
          props.anthropicApiKeySecret
        ),
      },
    });

    container.addPortMappings({ containerPort: 3000 });

    const service = new ecs.FargateService(this, "ApiService", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [props.apiSg],
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "ApiAlb", {
      vpc: props.vpc,
      internetFacing: true,
      securityGroup: props.albSg,
    });

    const listener = alb.addListener("HttpListener", {
      port: 80,
    });

    listener.addTargets("ApiTarget", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: "/health",
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // HTTPS:443 listener fronting api.claimgraph.io (the public hostname the
    // Vercel app calls server-to-server). The ACM certificate was provisioned
    // with DNS validation through Cloudflare and is referenced by ARN: the
    // claimgraph.io zone lives on Cloudflare, not Route 53, so CDK cannot
    // DNS-validate a certificate itself here.
    //
    // RECONCILIATION NOTE: this listener was first created out-of-band via the
    // AWS CLI to bring api.claimgraph.io online before this code existed, so
    // CloudFormation does not yet own it. The next `cdk deploy` will fail with
    // "a listener already exists on this port (443)" until the manual listener
    // is removed once:
    //   aws elbv2 describe-listeners --load-balancer-arn <alb-arn> \
    //     --query "Listeners[?Port==\`443\`].ListenerArn" --output text
    //   aws elbv2 delete-listener --listener-arn <that-arn>
    // After that one-time cleanup CDK creates and owns the listener. There is a
    // brief api.claimgraph.io HTTPS gap between delete and deploy; set Cloudflare
    // SSL/TLS to Flexible during the window or run it in a low-traffic period.
    // See docs/infrastructure.md.
    const apiCertificate = acm.Certificate.fromCertificateArn(
      this,
      "ApiCertificate",
      "arn:aws:acm:us-east-1:702111526219:certificate/49ad38f0-d695-468b-9424-f69bd3c8769b"
    );

    const httpsListener = alb.addListener("HttpsListener", {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [apiCertificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
    });

    httpsListener.addTargets("ApiTargetHttps", {
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: "/health",
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // Auto-scaling
    const scaling = service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 4,
    });

    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70,
    });

    this.albDnsName = alb.loadBalancerDnsName;

    new cdk.CfnOutput(this, "AlbDnsName", {
      value: alb.loadBalancerDnsName,
      description: "ALB DNS name",
    });
  }
}
