## Distributed Systems - Event-Driven Architecture

__Name:__ [Your Name]

__Demo:__ [YouTube Demo URL]

This repository contains the implementation of a photo gallery management application using an event-driven architecture on AWS. The solution leverages AWS CDK for infrastructure provisioning and includes features for photographers to upload images and add metadata, and moderators to review images and update their status.

![](./images/arch.jpg)

### Code Status

__Feature:__
+ Photographer:
  + Log new Images - Completed & Tested
  + Metadata updating - Completed & Tested
  + Invalid image removal - Completed & Tested  
  + Status Update Mailer - Completed & Tested
+ Moderator:
  + Status updating - Completed & Tested

### Implementation Details

The application implements all required functionality:

1. **Image Processing:**
   - Validates file types (.jpeg, .jpg, .png)
   - Rejects invalid files to DLQ
   - Records valid uploads in DynamoDB with initial 'Pending' status

2. **Metadata Management:**
   - Handles three metadata types (Caption, Date, name)
   - Uses SNS message attributes for type filtering
   - Properly escapes DynamoDB reserved keywords

3. **Status Updates:**
   - Processes moderator decisions (Pass/Reject)
   - Updates DynamoDB with status, reason, and date
   - Triggers email notifications for status changes

4. **Error Handling:**
   - Invalid files are moved to DLQ
   - RemoveImage Lambda automatically cleans up invalid files
   - Comprehensive error logging throughout

5. **Filtering:**
   - SNS subscriptions use filter policies
   - Metadata updates only go to AddMetadata Lambda
   - Status updates only go to relevant queues

### Notes

- The solution uses environment variables for configuration
- All AWS resources are properly secured with IAM permissions
- The architecture is fully serverless and event-driven
- Comprehensive logging is implemented across all Lambdas
- The CDK stack sets up all required infrastructure including:
  - S3 bucket for images
  - DynamoDB table for metadata
  - SNS topics and SQS queues with proper subscriptions
  - All Lambda functions with appropriate triggers