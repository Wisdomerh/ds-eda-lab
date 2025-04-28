import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    // DynamoDB table for photo metadata
    const photosTable = new dynamodb.Table(this, "photos-table", {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DLQ for invalid images
    const invalidImageDLQ = new sqs.Queue(this, "invalid-image-dlq", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    // Integration infrastructure - using DLQ for failed processing
    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
      deadLetterQueue: {
        queue: invalidImageDLQ,
        maxReceiveCount: 1,
      },
      visibilityTimeout: cdk.Duration.seconds(30),
    });

    const mailerQ = new sqs.Queue(this, "mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    // Status update mailer queue
    const statusUpdateMailerQ = new sqs.Queue(this, "status-update-mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    // Add SNS topics
    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    });

    const metadataTopic = new sns.Topic(this, "MetadataTopic", {
      displayName: "Metadata Topic",
    });

    const statusUpdateTopic = new sns.Topic(this, "StatusUpdateTopic", {
      displayName: "Status Update Topic",
    });

    // Lambda functions
    const processImageFn = new lambdanode.NodejsFunction(
      this,
      "ProcessImageFn",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/processImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: photosTable.tableName,
        },
      }
    );

    const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
      runtime: lambda.Runtime.NODEJS_16_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(5),
      entry: `${__dirname}/../lambdas/mailer.ts`,
      environment: {
        SES_REGION: 'eu-west-1',
        SES_EMAIL_FROM: 'wisdomonsobo@gmail.com',
        SES_EMAIL_TO: '20097898@mail.wit.ie',
        TABLE_NAME: photosTable.tableName
      },
    });

    // Additional Lambda functions for the photo gallery
    const removeImageFn = new lambdanode.NodejsFunction(
      this,
      "RemoveImageFn",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/removeImage.ts`,
        timeout: cdk.Duration.seconds(15),
        environment: {
          BUCKET_NAME: imagesBucket.bucketName,
        },
      }
    );

    const addMetadataFn = new lambdanode.NodejsFunction(
      this,
      "AddMetadataFn",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/addMetadata.ts`,
        timeout: cdk.Duration.seconds(15),
        environment: {
          TABLE_NAME: photosTable.tableName,
        },
      }
    );

    const updateStatusFn = new lambdanode.NodejsFunction(
      this,
      "UpdateStatusFn",
      {
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/updateStatus.ts`,
        timeout: cdk.Duration.seconds(15),
        environment: {
          TABLE_NAME: photosTable.tableName,
          TOPIC_ARN: statusUpdateTopic.topicArn,
        },
      }
    );

    // S3 --> SNS
    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newImageTopic)
    );

    // SNS --> SQS subscriptions
    // All S3 events go to the process queue for validation
    newImageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue)
    );
    
    // Subscribe mailer queue to the image topic
    newImageTopic.addSubscription(
      new subs.SqsSubscription(mailerQ)
    );

    // Connect DLQ to Remove Image Lambda
    const invalidImageEventSource = new events.SqsEventSource(invalidImageDLQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });
    removeImageFn.addEventSource(invalidImageEventSource);

    // Subscribe AddMetadata Lambda to metadata topic with filter
    metadataTopic.addSubscription(
      new subs.LambdaSubscription(addMetadataFn, {
        filterPolicy: {
          'metadata_type': sns.SubscriptionFilter.stringFilter({
            allowlist: ['Caption', 'Date', 'name'],
          }),
        },
      })
    );

    // Subscribe UpdateStatus Lambda to status topic
    statusUpdateTopic.addSubscription(
      new subs.LambdaSubscription(updateStatusFn)
    );

    // Subscribe status update SQS queue to status topic
    statusUpdateTopic.addSubscription(
      new subs.SqsSubscription(statusUpdateMailerQ, {
        filterPolicy: {
          'status_update': sns.SubscriptionFilter.existsFilter(),
        },
      })
    );

    // SQS --> Lambda
    const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });
    processImageFn.addEventSource(newImageEventSource);
    
    // SQS --> Mailer Lambda (for image uploads)
    const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });
    mailerFn.addEventSource(newImageMailEventSource);

    // SQS --> Mailer Lambda (for status updates)
    const statusUpdateMailEventSource = new events.SqsEventSource(statusUpdateMailerQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });
    mailerFn.addEventSource(statusUpdateMailEventSource);

    // Permissions
    imagesBucket.grantRead(processImageFn);
    imagesBucket.grantReadWrite(removeImageFn);
    photosTable.grantReadWriteData(processImageFn);
    photosTable.grantReadWriteData(addMetadataFn);
    photosTable.grantReadWriteData(updateStatusFn);
    photosTable.grantReadData(mailerFn);
    
    // SES permissions for mailer function
    mailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    // Output
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
    
    new cdk.CfnOutput(this, "metadataTopicArn", {
      value: metadataTopic.topicArn,
    });
    
    new cdk.CfnOutput(this, "statusTopicArn", {
      value: statusUpdateTopic.topicArn,
    });
  }
}