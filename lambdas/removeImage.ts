import { SQSHandler } from "aws-lambda";
<<<<<<< HEAD
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
=======
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
>>>>>>> c56e0379118dce7862f2b84cc7b2078a61680d54

const s3 = new S3Client();

export const handler: SQSHandler = async (event) => {
<<<<<<< HEAD
  console.log("Remove Image Lambda received event:", JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    try {
      console.log("Processing DLQ record:", JSON.stringify(record, null, 2));
      
      // For DLQ messages, the structure is different - we need to extract the original message
      let bucketName, imageKey;
      
      try {
        // Parse the DLQ message body
        const origRecord = JSON.parse(record.body);
        console.log("Parsed original record:", JSON.stringify(origRecord, null, 2));
        
        if (origRecord.body) {
          // This is a DLQ message from SQS
          const origBody = JSON.parse(origRecord.body);
          console.log("Parsed original body:", JSON.stringify(origBody, null, 2));
          
          if (origBody.Message) {
            const origSnsMessage = JSON.parse(origBody.Message);
            console.log("Parsed original SNS message:", JSON.stringify(origSnsMessage, null, 2));
            
            if (origSnsMessage.Records && origSnsMessage.Records[0] && origSnsMessage.Records[0].s3) {
              const s3Info = origSnsMessage.Records[0].s3;
              bucketName = s3Info.bucket.name;
              imageKey = decodeURIComponent(s3Info.object.key.replace(/\+/g, " "));
            }
          }
        } else if (origRecord.Message) {
          // Direct SNS message
          const snsMessage = JSON.parse(origRecord.Message);
          if (snsMessage.Records && snsMessage.Records[0] && snsMessage.Records[0].s3) {
            const s3Info = snsMessage.Records[0].s3;
            bucketName = s3Info.bucket.name;
            imageKey = decodeURIComponent(s3Info.object.key.replace(/\+/g, " "));
          }
        }
      } catch (parseError) {
        console.error("Error parsing DLQ message:", parseError);
        continue;
      }

      if (bucketName && imageKey) {
        console.log(`Removing invalid image: ${imageKey} from bucket: ${bucketName}`);
        
        // Use bucket name from environment if not found in message
        if (!bucketName && process.env.BUCKET_NAME) {
          bucketName = process.env.BUCKET_NAME;
        }
        
        // Check if the file exists
        try {
          await s3.send(new HeadObjectCommand({
            Bucket: bucketName,
            Key: imageKey
          }));
          
          // File exists, delete it
          await s3.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: imageKey
          }));
          
          console.log(`Successfully removed invalid file ${imageKey} from bucket ${bucketName}`);
        } catch (fileError) {
          if (fileError instanceof Error) {
            console.log(`Error checking/deleting file: ${fileError.message}`);
          } else {
            console.log(`Error checking/deleting file: ${JSON.stringify(fileError)}`);
          }
        }
      } else {
        console.error("Could not extract bucket and key information from DLQ message");
      }
    } catch (error) {
      console.error('Error processing DLQ message:', error);
=======
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
>>>>>>> c56e0379118dce7862f2b84cc7b2078a61680d54
    }
  }
};