import { SNSHandler, SNSEvent } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoDb = new DynamoDBClient();
const sns = new SNSClient();

export const handler: SNSHandler = async (event: SNSEvent) => {
  console.log("Update Status Lambda received event:", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.Sns.Message);
      
      console.log('Processing status update message:', message);
      
      // Validate message format
      if (!message.id || !message.date || !message.update || 
          !message.update.status || !message.update.reason) {
        console.error('Invalid message format for status update');
        continue;
      }
      
      // Validate status value
      if (!['Pass', 'Reject'].includes(message.update.status)) {
        console.error(`Invalid status value: ${message.update.status}. Must be Pass or Reject.`);
        continue;
      }
      
      // Get the current item
      const getParams = {
        TableName: process.env.TABLE_NAME,
        Key: marshall({
          id: message.id
        })
      };
      
      const currentItem = await dynamoDb.send(new GetItemCommand(getParams));
      const item = currentItem.Item ? unmarshall(currentItem.Item) : null;
      
      if (!item) {
        console.error(`Item with id ${message.id} not found in the database`);
        continue;
      }
      
      // Update the DynamoDB record with the new status
      const updateParams = {
        TableName: process.env.TABLE_NAME,
        Key: marshall({ id: message.id }),
        UpdateExpression: 'SET #status = :status, statusDate = :date, statusReason = :reason',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: marshall({
          ':status': message.update.status,
          ':date': message.date,
          ':reason': message.update.reason
        })
      };
      
      const result = await dynamoDb.send(new UpdateItemCommand(updateParams));
      console.log(`Successfully updated status for image ${message.id}:`, result);
      
      // If status is different, publish to SNS to trigger email notification
      if (!item.status || item.status !== message.update.status) {
        // Get the topic ARN from the environment variable
        const topicArn = process.env.TOPIC_ARN;
        
        const notificationParams = {
          TopicArn: topicArn,
          Message: JSON.stringify({
            id: message.id,
            photographerName: item.name || 'Photographer',
            status: message.update.status,
            reason: message.update.reason,
            date: message.date
          }),
          MessageAttributes: {
            'status_update': {
              DataType: 'String',
              StringValue: 'true'
            }
          }
        };
        
        await sns.send(new PublishCommand(notificationParams));
        console.log(`Published status update notification for image ${message.id}`);
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  }
};