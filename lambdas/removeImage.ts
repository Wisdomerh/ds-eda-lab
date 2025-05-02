import { SQSHandler } from "aws-lambda";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({ region: 'eu-west-1' });

export const handler: SQSHandler = async (event) => {
  console.log("Remove Image Lambda received event");

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const message = body.Message ? JSON.parse(body.Message) : body;
      
      // Extract from both direct S3 events and SNS-wrapped events
      const s3Info = message.Records?.[0]?.s3 || message.s3;
      if (!s3Info) {
        console.error("No S3 info found in message");
        continue;
      }

      const bucketName = s3Info.bucket.name;
      const imageKey = decodeURIComponent(s3Info.object.key.replace(/\+/g, " "));

      console.log(`Deleting invalid file: ${imageKey} from ${bucketName}`);
      
      await s3.send(new DeleteObjectCommand({
        Bucket: bucketName,
        Key: imageKey
      }));
      
      console.log(`Successfully deleted ${imageKey}`);
    } catch (error) {
      console.error("Error processing record:", error);
    }
  }
};