import { SQSHandler } from "aws-lambda";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

// Use environment variables from Lambda instead of importing from '../env'
const SES_REGION = process.env.SES_REGION || 'eu-west-1';
const SES_EMAIL_FROM = process.env.SES_EMAIL_FROM || 'wisdomonsobo@gmail.com';
const SES_EMAIL_TO = process.env.SES_EMAIL_TO || '20097898@mail.wit.ie';

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

type StatusUpdateDetails = {
  photographerName: string;
  imageId: string;
  status: string;
  reason: string;
  date: string;
};

const client = new SESClient({ region: SES_REGION });
const dynamoDb = new DynamoDBClient();

export const handler: SQSHandler = async (event: any) => {
  console.log("Event ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);

    // Check if this is a status update message
    if (recordBody.MessageAttributes && 
        recordBody.MessageAttributes.status_update && 
        recordBody.MessageAttributes.status_update.Value === 'true') {
      
      await handleStatusUpdate(recordBody);
    } 
    // Otherwise treat as a regular image upload message
    else if (recordBody.Message) {
      const snsMessage = JSON.parse(recordBody.Message);

      if (snsMessage.Records) {
        console.log("Record body ", JSON.stringify(snsMessage));
        for (const messageRecord of snsMessage.Records) {
          const s3e = messageRecord.s3;
          const srcBucket = s3e.bucket.name;
          // Object key may have spaces or unicode non-ASCII characters.
          const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
          
          // Only send emails for valid image types
          if (srcKey.toLowerCase().endsWith('.jpeg') || 
              srcKey.toLowerCase().endsWith('.png') ||
              srcKey.toLowerCase().endsWith('.jpg')) {
            try {
              const { name, email, message }: ContactDetails = {
                name: "The Photo Album",
                email: SES_EMAIL_FROM,
                message: `We received your Image. Its URL is s3://${srcBucket}/${srcKey}`,
              };
              const params = sendEmailParams({ name, email, message });
              await client.send(new SendEmailCommand(params));
              console.log("Email sent successfully for image:", srcKey);
            } catch (error: unknown) {
              console.log("ERROR is: ", error);
            }
          } else {
            console.log(`Skipping email for invalid file type: ${srcKey}`);
          }
        }
      }
    }
  }
};

async function handleStatusUpdate(recordBody: any) {
  try {
    const message = JSON.parse(recordBody.Message);
    
    console.log('Processing status update email notification:', message);
    
    // Get the full photo record from DynamoDB if table name is provided
    let photographerName = message.photographerName || 'Photographer';
    
    if (process.env.TABLE_NAME) {
      try {
        const getParams = {
          TableName: process.env.TABLE_NAME,
          Key: marshall({
            id: message.id
          })
        };
        
        const result = await dynamoDb.send(new GetItemCommand(getParams));
        const photo = result.Item ? unmarshall(result.Item) : null;
        
        if (photo && photo.name) {
          photographerName = photo.name;
        }
      } catch (dbError) {
        console.error('Error retrieving photo data from DynamoDB:', dbError);
      }
    }
    
    // Prepare status update email
    const statusDetails: StatusUpdateDetails = {
      photographerName,
      imageId: message.id,
      status: message.status,
      reason: message.reason,
      date: message.date
    };
    
    const params = sendStatusUpdateEmail(statusDetails);
    await client.send(new SendEmailCommand(params));
    console.log(`Status update email sent successfully for photo ${message.id}`);
  } catch (error) {
    console.error('Error sending status update email:', error);
  }
}

function sendEmailParams({ name, email, message }: ContactDetails) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent({ name, email, message }),
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `New image Upload`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  return parameters;
}

function sendStatusUpdateEmail({ photographerName, imageId, status, reason, date }: StatusUpdateDetails) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getStatusUpdateContent({ photographerName, imageId, status, reason, date }),
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `Photo Review Status Update: ${status}`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  return parameters;
}

function getHtmlContent({ name, email, message }: ContactDetails) {
  return `
    <html>
      <body>
        <h2>Sent from: </h2>
        <ul>
          <li style="font-size:18px">👤 <b>${name}</b></li>
          <li style="font-size:18px">✉️ <b>${email}</b></li>
        </ul>
        <p style="font-size:18px">${message}</p>
      </body>
    </html> 
  `;
}

function getStatusUpdateContent({ photographerName, imageId, status, reason, date }: StatusUpdateDetails) {
  return `
    <html>
      <body>
        <h2>Photo Status Update</h2>
        <p>Hello ${photographerName},</p>
        <p>Your photo (${imageId}) has been reviewed and its status has been updated to: <strong>${status}</strong>.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p><strong>Date of review:</strong> ${date}</p>
        <p>Thank you for using our Photo Gallery service.</p>
      </body>
    </html>
  `;
}

function getTextContent({ name, email, message }: ContactDetails) {
  return `
    Received an Email. 📬
    Sent from:
        👤 ${name}
        ✉️ ${email}
    ${message}
  `;
}