import { SQSHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand, PutItemCommandInput } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const s3 = new S3Client();
const dynamoDb = new DynamoDBClient({ 
  region: 'eu-west-1' // Explicit region setting
});

export const handler: SQSHandler = async (event) => {
  console.log("Process Image Lambda received event:", JSON.stringify(event, null, 2));
  console.log("Environment Variables:", {
    TABLE_NAME: process.env.TABLE_NAME,
    AWS_REGION: process.env.AWS_REGION
  });

  for (const record of event.Records) {
    try {
      const recordBody = JSON.parse(record.body);
      const snsMessage = JSON.parse(recordBody.Message);

      if (snsMessage.Records) {
        for (const messageRecord of snsMessage.Records) {
          const s3Info = messageRecord.s3;
          const bucketName = s3Info.bucket.name;
          const imageKey = decodeURIComponent(s3Info.object.key.replace(/\+/g, " "));
          
          console.log(`Processing file: ${imageKey} from bucket: ${bucketName}`);

          // Validate file type
          const validExtensions = ['.jpeg', '.jpg', '.png'];
          const isValidImage = validExtensions.some(ext => 
            imageKey.toLowerCase().endsWith(ext)
          );

          if (!isValidImage) {
            console.error(`Invalid file type: ${imageKey}`);
            throw new Error(`Invalid file type: ${imageKey}`);
          }

          try {
            // Verify image exists in S3
            await s3.send(new GetObjectCommand({
              Bucket: bucketName,
              Key: imageKey,
            }));

            // Prepare DynamoDB item with all required fields
            const dbItem = {
              id: imageKey,
              uploadTime: new Date().toISOString(),
              status: 'Pending',
              s3Location: `s3://${bucketName}/${imageKey}`,
              lastModified: messageRecord.eventTime
            };

            const params: PutItemCommandInput = {
              TableName: process.env.TABLE_NAME,
              Item: marshall(dbItem, { removeUndefinedValues: true }),
              ReturnConsumedCapacity: 'TOTAL'
            };

            console.log("DynamoDB Put Parameters:", JSON.stringify(params, null, 2));
            
            const result = await dynamoDb.send(new PutItemCommand(params));
            console.log("Successfully recorded image in DynamoDB:", {
              imageKey,
              consumedCapacity: result.ConsumedCapacity,
              metadata: result.$metadata
            });

          } catch (error) {
            console.error('Error processing image:', error);
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      throw error;
    }
  }
};