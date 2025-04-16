import { SQSHandler } from "aws-lambda";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client();

export const handler: SQSHandler = async (event) => {
  console.log("Remove Image Lambda received event:", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      const recordBody = JSON.parse(record.body);
      const snsMessage = JSON.parse(recordBody.Message);

      if (snsMessage.Records) {
        for (const messageRecord of snsMessage.Records) {
          const s3Info = messageRecord.s3;
          const bucketName = s3Info.bucket.name;
          const imageKey = decodeURIComponent(s3Info.object.key.replace(/\+/g, " "));
          
          console.log(`Removing invalid image: ${imageKey} from bucket: ${bucketName}`);
          
          // Delete the invalid file from S3
          const deleteParams = {
            Bucket: bucketName,
            Key: imageKey,
          };
          
          await s3.send(new DeleteObjectCommand(deleteParams));
          console.log(`Successfully removed invalid image ${imageKey} from bucket ${bucketName}`);
        }
      }
    } catch (error) {
      console.error('Error removing invalid image:', error);
    }
  }
};