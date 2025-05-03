import { SNSHandler, SNSEvent } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const dynamoDb = new DynamoDBClient();

export const handler: SNSHandler = async (event: SNSEvent) => {
  console.log("Add Metadata Lambda received event:", JSON.stringify(event));

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.Sns.Message);
      const metadataType = record.Sns.MessageAttributes.metadata_type?.Value;
      
      console.log(`Processing metadata update. Type: ${metadataType}, Message:`, message);
      
      // Validate message format
      if (!message.id || !message.value) {
        console.error('Invalid message format. Must include id and value properties.');
        continue;
      }
      
      // Validate metadata type
      if (!['Caption', 'Date', 'name'].includes(metadataType)) {
        console.error(`Invalid metadata type: ${metadataType}. Must be Caption, Date, or name.`);
        continue;
      }
      
      // Create a properly escaped update expression for reserved keywords
      let updateExpression = "";
      let expressionAttributeNames = {};
      
      // Handle reserved keywords by using expression attribute names
      if (metadataType.toLowerCase() === 'name' || metadataType.toLowerCase() === 'date') {
        updateExpression = "SET #attrName = :value";
        expressionAttributeNames = { "#attrName": metadataType.toLowerCase() };
      } else {
        updateExpression = `SET ${metadataType.toLowerCase()} = :value`;
      }
      
      // Update the DynamoDB record with the new metadata
      const updateParams = {
        TableName: process.env.TABLE_NAME,
        Key: marshall({ id: message.id }),
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: marshall({
          ':value': message.value
        }),
        ...(Object.keys(expressionAttributeNames).length > 0 && { 
          ExpressionAttributeNames: expressionAttributeNames 
        })
      };
      
      const result = await dynamoDb.send(new UpdateItemCommand(updateParams));
      console.log(`Successfully updated ${metadataType} for image ${message.id}:`, result);
    } catch (error) {
      console.error('Error updating metadata:', error);
    }
  }
};