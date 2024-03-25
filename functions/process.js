const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");
const { getDifferences } = require("./get-diff-json");
const { setupDatabase } = require("./setup-db");

exports.processDatabases = async (telegramManager) => {
  // Initialize the clients for the databases
  const postgresClients = [];
  const mongoClients = [];
  // Load database configurations
  const dbConfigs = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config.json"), "utf-8")
  );

  for (const configs of dbConfigs) {
    switch (configs?.type) {
      case "postgres": {
        for (const config of configs?.configs) {
          const client = await setupDatabase(config);
          postgresClients.push(client);
        }

        for (const client of postgresClients) {
          client.query("LISTEN tbl_changes");

          client.on("notification", async (msg) => {
            const payload = JSON.parse(msg.payload);
            const action = payload.action;

            // Find the config for the database that sent the notification
            // and send the notification to the Telegram topic
            const databaseName = payload?.database_name;
            const config = configs?.configs.find(
              (c) => c.database === databaseName
            );

            let message = "";
            switch (String(action).toUpperCase()) {
              case "INSERT": {
                const table = (payload?.table_name || "").replace(/_/g, `\\_`);
                message = `Insert *${table}*:\n\`\`\`json\n${JSON.stringify(
                  sanitizeJson(payload.data),
                  null,
                  2
                )}\n\`\`\``;

                break;
              }
              case "UPDATE": {
                const newData = payload?.new_data || [];
                const oldData = payload?.old_data || [];
                const updateData = {
                  id: payload?.new_data?.id,
                  ...getDifferences(oldData, newData),
                };
                const table = (payload?.table_name || "").replace(/_/g, `\\_`);
                message = `Update *${table}*:\n\`\`\`json\n${JSON.stringify(
                  updateData,
                  null,
                  2
                )}\n\`\`\``;

                break;
              }
            }

            // Append message to telegram manager to send
            telegramManager.appendMessage(
              message,
              configs?.telegramGroupId,
              config?.messageThreadId
            );
          });
        }
        break;
      }
      case "mongo": {
        for (const config of configs?.configs) {
          const client = new MongoClient(config.uri);
          await client.connect();
          mongoClients.push(client);

          const database = client.db(config.database);
          const changeStream = database.watch();

          changeStream.on("change", (change) => {
            const operationType = change.operationType;
            const fullDocument = change.fullDocument;
            const ns = change.ns;
            const collectionName = (ns.coll || "").replace(/_/g, `\\_`);

            let message;
            switch (operationType) {
              case "insert": {
                message = `Insert on *${collectionName}*:\n\`\`\`json\n${JSON.stringify(
                  sanitizeJson(fullDocument),
                  null,
                  2
                )}\n\`\`\``;
                break;
              }
              case "update": {
                const updateFields = change?.updateDescription?.updatedFields;
                const objResponse = {
                  _id: change?.documentKey?._id,
                  ...updateFields,
                };
                message = `Update on *${collectionName}*:\n\`\`\`json\n${JSON.stringify(
                  sanitizeJson(objResponse),
                  null,
                  2
                )}\n\`\`\``;
                break;
              }
            }

            // Append message to telegram manager to send
            telegramManager.appendMessage(
              message,
              configs?.telegramGroupId,
              config?.messageThreadId
            );
          });
        }
        break;
      }
    }
  }
};
