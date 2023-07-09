const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.modify'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
const  loadSavedCredentialsIfExist = async ()  =>  {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAUth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
const saveCredentials= async (client) =>{
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
const authorize = async ()=> {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
const listLabels= async (auth) => {
  const gmail = google.gmail({version: 'v1', auth});
  const res = await gmail.users.labels.list({
    userId: 'me',
  });
  const labels = res.data.labels;
  if (!labels || labels.length === 0) {
    console.log('No labels found.');
    return;
  }
 
  console.log('Labels:');
  labels.forEach((label) => {
    console.log(`${label.id}- ${label.name}`);
  });
}


 //Function for reading new mail
  const getNewMail = async (auth) =>
  {
    const gmail = google.gmail({version: 'v1', auth});
    try {
       // Construct the query to search for unread emails that are not "no reply"
        const query = `is:unread -from:"noreply" -from:"no-reply" -from:"do-not-reply"`;
        const res =await  gmail.users.messages.list(
            { userId: 'me',auth:auth, maxResults:1, q: query })
    
            const messages = res.data.messages;
            if (messages && messages.length) {
              // Process the list of unread emails
              console.log("Processing Emails" )
              for (const message of messages)  {
           
             await processEmail(auth,message.id);
      
              };
            } else {
              console.log('No unread emails found.');
            }
      } catch (err) {
        console.error('Error retrieving profile:', err.message);
      }

  }

  //Function for processing email it reads,add lables and send reply
  const processEmail = async (auth,emailId) => {
    const gmail = google.gmail({version: 'v1', auth});
  
    try {
      const res = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        auth: auth
      });
  
      const email = res.data;
     
      // Check if the email is the first in the thread and not sent by you
     
     if (email.id === email.threadId && email.from !== 'YOUR_EMAIL_ADDRESS') {
      try{
         
         //Marking Email as read
         console.log("Email marked as read")
        await markAsRead(auth,emailId)
          //Send a reply email
          console.log("Sending Reply" )
           sendReplyEmail(auth,email).then(async(success)=>{ 
    
            if(success)
            {
            //creating label 
             const label = 'HOLIDAY_LABEL'
             console.log("creating a label")
             await createLabel(auth,label);
            //adding label to email replied
             console.log("adding label to email replied")
             await addLabelToEmail(auth,emailId,label);}
      })
         
         
      }catch(err) {
        console.error('Error processing email:', err.message);
      }
      
       
       } else {
     console.log('Email is not the first in the thread or sent by you.');
       }
    } catch (err) {
      console.error('Error processing email:', err.message);
    }
  };

  // Mark as Read Email
  const markAsRead = async(auth,emailId)=>{
    const gmail = google.gmail({version: 'v1', auth:auth});
     try {

      await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        resource: {
          removeLabelIds: ['UNREAD'],
        },
      });
      
     }catch(err) {
      console.error('Marking Email As Read Error:', err.message);
    }

  }
  
  // Send a reply email
  const sendReplyEmail = async (auth,email) => {
    const gmail = google.gmail({version: 'v1', auth});
  
    try {
      
      const headers = email.payload.headers;
      //obtaining email address of sender
      const fromHeader = headers.find(header => header.name === 'From');
      // here value of formHeader of the form "Name by <email@gmail.com>"
      // to obtain valid email we have to split and make substring
      const str = fromHeader.value.split(' ')[2];
      if(!str)
      {
        console.log('its advertisement mail no need to reply');
       
        return
      }
      const senderEmail=str.substring(1, str.length - 1);
      console.log("emailSender:",senderEmail)
      //obtaining subject of email
      const subjectHeader = headers.find(header => header.name === 'Subject');
      const subject = subjectHeader.value;
      const emailContent = `To: ${senderEmail}
      \r\nSubject: ${subject}
      \r\n\r\n
      Hii! I,am on a vacation catch up you later`;

     const encodedEmail = Buffer.from(emailContent)
     .toString('base64')
     .replace(/\+/g, '-')
     .replace(/\//g, '_')
     .replace(/=+$/, '');
  
      await gmail.users.messages.send({
        userId: 'me',
        auth: auth,
        resource: {
          raw:encodedEmail
        }
      });
  
      console.log('Reply email sent successfully.');
      return true
    } catch (err) {
    
      console.error('Error sending reply to advertisement  email:', err.message);
    }
  };
  
 
  
  // Function to create a label in Gmail
const createLabel = async (auth ,  labelName) =>{
  const gmail = google.gmail({ version: 'v1', auth: auth });

  // Check if the label already exists
  const labelResponse = await gmail.users.labels.list({ userId: 'me' });
  const existingLabel = labelResponse.data.labels.find(label => label.name === labelName);

  if (existingLabel) {
    console.log(`Label '${labelName}' already exists.`);
    
    return;
  }

 
  await gmail.users.labels.create({
    userId: 'me',
    resource: {
      name: labelName,
      labelListVisibility: 'labelShow',
      messageListVisibility: 'show'
    }
  });

  console.log(`Label '${labelName}' created successfully.`);
 
  
}

// Function to add the label to an email
const addLabelToEmail = async (auth,emailId,labelName) =>{
  const gmail = google.gmail({ version: 'v1', auth: auth });

  
  const getLabelsResponse = await gmail.users.messages.get({ userId:'me', id: emailId });
  const existingLabels = getLabelsResponse.data.labelIds || [];
  
  // Check if the label is already added to the email
  if (existingLabels.includes(labelName)) {
    console.log(`Label '${labelName}' is already added to the email.`);
    return;
  }
 
  // Add the label to the email
  try {

    await gmail.users.messages.modify({
      userId: 'me',
      id: emailId,
      resource: {
        addLabelIds:['Label_4'],
      },
    });
    console.log(`Label '${labelName}' added to the email successfully.`);
   }catch(err) {
    console.error('Marking Email As Read Error:', err.message);
  }
  
    
 

  
}

const main = ()=>{
  
  console.log(`---------------------------------------------------`)
   authorize().then(getNewMail).catch(console.error);
 
}
main()
setInterval(main, 100000);
