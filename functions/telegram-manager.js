require("dotenv").config();

class TelegramManager {
  constructor(bot) {
    this.bot = bot;

    this.messageId = null;
    this.messageCurrent = [];
    this.timeCheckSendMessage = new Date().getTime();
    this.processing = false;
  }

  async appendMessage(message, chatId, messageThreadId) {
    let hasSameMessage = false;
    this.messageCurrent = this.messageCurrent
      .reverse()
      .map((messageObj) => {
        if (
          !hasSameMessage &&
          messageObj.chatId === chatId &&
          ((!messageObj.messageThreadId && !messageThreadId) ||
            messageObj.messageThreadId === messageThreadId) &&
          (messageObj.message + message).length < 4096
        ) {
          hasSameMessage = true;
          return {
            ...messageObj,
            message: messageObj.message + message,
          };
        } else return messageObj;
      })
      .reverse();

    if (!hasSameMessage) {
      this.messageCurrent.push({
        chatId,
        messageThreadId,
        message,
      });
    }
    console.log("messageCurrent: ", this.messageCurrent);
  }

  async sendOneMessage(checkTime) {
    // Check if processing
    if (this.processing) return;
    // Check if message is empty to return
    if (this.messageCurrent.length === 0) return;

    // Check time to prevent send multiple request in times
    if (checkTime) {
      const now = new Date().getTime();
      if (now - this.timeCheckSendMessage < 1000) {
        return;
      }
      this.timeCheckSendMessage = now;
    }

    // Set the processing
    this.processing = true;

    try {
      // Get the first message
      const messageObj = this.messageCurrent[0];
      let messageSend = messageObj.message;

      // Check if message is too long to split message into multiple message
      if (messageObj.message.length > 4090) {
        if (messageObj?.isCountinue) {
          messageSend =
            "```json" + messageObj.message.substring(0, 4090) + "```";
        } else {
          messageSend = messageObj.message.substring(0, 4090) + "```";
        }
      } else {
        if (messageObj?.isCountinue) {
          messageSend = "```json" + messageObj.message;
        }
      }

      const t = await this.bot.telegram.sendMessage(
        messageObj.chatId,
        messageSend,
        {
          // parse_mode: "HTML",
          parse_mode: "MarkdownV2",
          ...(messageObj.messageThreadId && {
            message_thread_id: messageObj.messageThreadId,
          }),
        }
      );

      // Update message current if message is too long
      // or remove the first message
      if (messageObj.message.length > 4090) {
        messageObj.message = messageObj.message.substring(4090);
        messageObj.isCountinue = true;
      } else {
        // Remove the first message
        this.messageCurrent.shift();
      }

      // Clear the processing
      this.processing = false;

      return t;
    } catch (error) {
      // Clear the processing
      this.processing = false;

      console.log("send message current error: ", error);
    }
  }
}

module.exports = TelegramManager;
