import * as cdk from "aws-cdk-lib";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export interface DatabaseStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
  dbSg: ec2.SecurityGroup;
}

export class DatabaseStack extends cdk.Stack {
  public readonly dbInstance: rds.DatabaseInstance;
  public readonly dbSecret: rds.DatabaseSecret;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    this.dbSecret = new rds.DatabaseSecret(this, "EpistemeDbSecret", {
      username: "episteme",
    });

    this.dbInstance = new rds.DatabaseInstance(this, "EpistemeDb", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [props.dbSg],
      credentials: rds.Credentials.fromSecret(this.dbSecret),
      databaseName: "episteme",
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      backupRetention: cdk.Duration.days(7),
    });
  }
}
