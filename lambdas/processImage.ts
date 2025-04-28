import { SQSHandler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const s3 = new S3Client();
const dynamoDb = new DynamoDBClient();

export const handler: SQSHandler = async (event) => {
  console.log("Process Image Lambda received event:", JSON.stringify(event, null, 2));

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
          
          // Validate file type - only allow .jpeg and .png files
          if (!imageKey.toLowerCase().endsWith('.jpeg') && 
              !imageKey.toLowerCase().endsWith('.png') &&
              !imageKey.toLowerCase().endsWith('.jpg')) {
            console.error(`Invalid file type: ${imageKey}. Only .jpeg, .jpg, and .png are allowed.`);
            // Force rejection to trigger DLQ
            throw new Error(`Invalid file type: ${imageKey}`);
          }
          
          try {
            // Download the image from the S3 source bucket to verify it exists
            await s3.send(new GetObjectCommand({
              Bucket: bucketName,
              Key: imageKey,
            }));
            
            // Store image record in DynamoDB
            const params = {
              TableName: process.env.TABLE_NAME,
              Item: marshall({
                id: imageKey,
                uploadTime: new Date().toISOString(),
                status: 'Pending'
              })
            };
            
            await dynamoDb.send(new PutItemCommand(params));
            console.log(`Successfully recorded image ${imageKey} in DynamoDB`);
          } catch (dbError) {
            console.error('Error storing in DynamoDB:', dbError);
            throw dbError; // Re-throw to trigger DLQ
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
      throw error; // Re-throw to trigger DLQ
    }
  }
};