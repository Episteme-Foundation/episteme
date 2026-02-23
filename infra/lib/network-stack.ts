import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export class NetworkStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly albSg: ec2.SecurityGroup;
  public readonly apiSg: ec2.SecurityGroup;
  public readonly dbSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, "EpistemeVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: "Isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    // ALB security group: 80/443 from internet
    this.albSg = new ec2.SecurityGroup(this, "AlbSg", {
      vpc: this.vpc,
      description: "ALB security group",
      allowAllOutbound: true,
    });
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP");
    this.albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), "HTTPS");

    // API security group: 3000 from ALB only
    this.apiSg = new ec2.SecurityGroup(this, "ApiSg", {
      vpc: this.vpc,
      description: "API (Fargate) security group",
      allowAllOutbound: true,
    });
    this.apiSg.addIngressRule(this.albSg, ec2.Port.tcp(3000), "From ALB");

    // DB security group: 5432 from API only
    this.dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc: this.vpc,
      description: "Database security group",
      allowAllOutbound: false,
    });
    this.dbSg.addIngressRule(this.apiSg, ec2.Port.tcp(5432), "From API");

    // Bedrock VPC endpoint for private access
    this.vpc.addInterfaceEndpoint("BedrockEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.BEDROCK_RUNTIME,
      privateDnsEnabled: true,
      securityGroups: [this.apiSg],
    });
  }
}
