import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
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

    taskDef.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: ["*"],
      })
    );

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
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(props.dbSecret, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(props.dbSecret, "password"),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(
          props.openaiApiKeySecret
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
