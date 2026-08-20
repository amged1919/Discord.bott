require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  StringSelectMenuBuilder,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ======================================================
// ENV
// ======================================================

const env = process.env;

if (!env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN غير موجود في Variables");
  process.exit(1);
}

if (!env.GUILD_ID) {
  console.error("❌ GUILD_ID غير موجود في Variables");
  process.exit(1);
}

// ======================================================
// DATA
// ======================================================

const dataDir = path.join(__dirname, "data");
const productsFile = path.join(dataDir, "products.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(productsFile, "[]", "utf8");
}

function getProducts() {
  try {
    const data = fs.readFileSync(productsFile, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("❌ خطأ في قراءة المنتجات:", error);
    return [];
  }
}

function saveProducts(products) {
  try {
    fs.writeFileSync(
      productsFile,
      JSON.stringify(products, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("❌ خطأ في حفظ المنتجات:", error);
  }
}

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ======================================================
// COMMANDS
// ======================================================

const commands = [

  // =========================
  // STORE
  // =========================

  new SlashCommandBuilder()
    .setName("store")
    .setDescription("عرض متجر Soork Store"),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("إرسال لوحة المتجر")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  // =========================
  // PRODUCTS
  // =========================

  new SlashCommandBuilder()
    .setName("products")
    .setDescription("عرض المنتجات"),

  new SlashCommandBuilder()
    .setName("addproduct")
    .setDescription("إضافة منتج")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("اسم المنتج")
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName("price")
        .setDescription("السعر بالريال")
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName("stock")
        .setDescription("عدد المنتجات")
        .setRequired(true)
        .setMinValue(0)
    )
    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("وصف المنتج")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("removeproduct")
    .setDescription("حذف منتج")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("ID المنتج")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("editproduct")
    .setDescription("تعديل منتج")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("ID المنتج")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("الاسم الجديد")
        .setRequired(false)
    )
    .addNumberOption(option =>
      option
        .setName("price")
        .setDescription("السعر الجديد")
        .setRequired(false)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName("stock")
        .setDescription("المخزون الجديد")
        .setRequired(false)
        .setMinValue(0)
    )
    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("الوصف الجديد")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("stock")
    .setDescription("عرض مخزون المتجر")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

].map(command => command.toJSON());

// ======================================================
// STAFF
// ======================================================

function isStaff(interaction) {

  if (!interaction.member) {
    return false;
  }

  // صاحب السيرفر / إدارة السيرفر
  if (
    interaction.member.permissions &&
    interaction.member.permissions.has(
      PermissionFlagsBits.ManageGuild
    )
  ) {
    return true;
  }

  // رتبة الإدارة
  if (
    env.STAFF_ROLE_ID &&
    interaction.member.roles &&
    interaction.member.roles.cache &&
    interaction.member.roles.cache.has(env.STAFF_ROLE_ID)
  ) {
    return true;
  }

  return false;
}

// ======================================================
// STORE EMBED
// ======================================================

function storeEmbed() {

  return new EmbedBuilder()
    .setTitle(
      `🛒 ${env.STORE_NAME || "Soork Store"}`
    )
    .setDescription(
      "اختر المنتج من القائمة بالأسفل.\n\n" +
      "🎫 سيتم إنشاء تكت خاص بك.\n" +
      "💳 ستظهر لك بيانات تحويل الراجحي داخل التكت.\n" +
      "📤 بعد التحويل أرسل إثبات الدفع.\n\n" +
      "⚠️ لا يتم اعتبار الطلب مدفوعًا حتى يتم تأكيده من الإدارة."
    )
    .setFooter({
      text: "Soork Store",
    });
}

// ======================================================
// PRODUCT MENU
// ======================================================

function productMenu() {

  const products = getProducts()
    .filter(product => Number(product.stock) > 0)
    .slice(0, 25);

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId("select_product")
      .setPlaceholder("🛒 اختر المنتج");

  if (products.length === 0) {

    menu.addOptions({
      label: "لا توجد منتجات متوفرة",
      description: "لا يوجد مخزون حاليًا",
      value: "none",
    });

  } else {

    menu.addOptions(
      products.map(product => ({
        label: `${product.name} - ${product.price} ريال`.slice(
          0,
          100
        ),
        description: String(
          product.description || "بدون وصف"
        ).slice(0, 100),
        value: product.id,
      }))
    );

  }

  return menu;
}

// ======================================================
// PAYMENT EMBED
// ======================================================

function paymentEmbed(product) {

  return new EmbedBuilder()
    .setTitle("💳 بيانات الدفع")
    .setDescription(

      `**🏦 البنك:** ${
        env.RAJHI_BANK_NAME || "مصرف الراجحي"
      }\n\n` +

      `**👤 اسم صاحب الحساب:** ${
        env.RAJHI_ACCOUNT_NAME || "غير مضبوط"
      }\n\n` +

      `**💳 الآيبان:**\n` +
      `\`${env.RAJHI_IBAN || "غير مضبوط"}\`\n\n` +

      `**💰 المبلغ:** ${product.price} ريال\n\n` +

      "بعد التحويل اضغط زر **📤 إثبات الدفع** " +
      "ثم أرسل صورة أو ملف التحويل داخل التكت.\n\n" +

      "⚠️ لا ترسل أي معلومات بنكية غير المطلوبة.\n" +
      "⚠️ الطلب لا يعتبر مدفوعًا حتى يتم تأكيده من الإدارة."

    )
    .setFooter({
      text: "Soork Store • Al Rajhi",
    });
}

// ======================================================
// ORDER BUTTONS
// ======================================================

function orderButtons() {

  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId("proof")
      .setLabel("إثبات الدفع")
      .setEmoji("📤")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("approve")
      .setLabel("تأكيد الدفع")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("reject")
      .setLabel("رفض الإثبات")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("close")
      .setLabel("إغلاق التكت")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)

  );
}

// ======================================================
// READY
// ======================================================

client.once("ready", async () => {

  console.log("================================");
  console.log(`🤖 Bot: ${client.user.tag}`);
  console.log("================================");

  try {

    const rest =
      new REST({ version: "10" })
        .setToken(env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        env.GUILD_ID
      ),
      {
        body: commands,
      }
    );

    console.log("✅ Slash commands registered.");

  } catch (error) {

    console.error(
      "❌ Command registration error:",
      error
    );

  }

});

// ======================================================
// INTERACTIONS
// ======================================================

client.on(
  "interactionCreate",
  async interaction => {

    try {

      // ==================================================
      // SLASH COMMANDS
      // ==================================================

      if (interaction.isChatInputCommand()) {

        // ================================================
        // /store
        // ================================================

        if (interaction.commandName === "store") {

          await interaction.reply({
            embeds: [storeEmbed()],
            components: [
              new ActionRowBuilder()
                .addComponents(productMenu()),
            ],
          });

          return;
        }

        // ================================================
        // /setup
        // ================================================

        if (interaction.commandName === "setup") {

          if (!isStaff(interaction)) {

            await interaction.reply({
              content: "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });

            return;
          }

          await interaction.reply({
            embeds: [storeEmbed()],
            components: [
              new ActionRowBuilder()
                .addComponents(productMenu()),
            ],
          });

          return;
        }

        // ================================================
        // /products
        // ================================================

        if (interaction.commandName === "products") {

          const products = getProducts();

          if (products.length === 0) {

            await interaction.reply({
              content: "📦 لا توجد منتجات.",
              ephemeral: true,
            });

            return;
          }

          let text = "🛒 **منتجات Soork Store**\n\n";

          for (const product of products) {

            text +=
              `📦 **${product.name}**\n` +
              `🆔 \`${product.id}\`\n` +
              `💰 السعر: **${product.price} ريال**\n` +
              `📊 المخزون: **${product.stock}**\n` +
              `📝 ${product.description || "بدون وصف"}\n\n`;

          }

          await interaction.reply({
            content: text.slice(0, 4000),
            ephemeral: true,
          });

          return;
        }

        // ================================================
        // /addproduct
        // ================================================

        if (
          interaction.commandName ===
          "addproduct"
        ) {

          if (!isStaff(interaction)) {

            await interaction.reply({
              content: "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });

            return;
          }

          const name =
            interaction.options.getString("name");

          const price =
            interaction.options.getNumber("price");

          const stock =
            interaction.options.getInteger("stock");

          const description =
            interaction.options.getString(
              "description"
            ) || "بدون وصف";

          const products = getProducts();

          const id =
            Date.now().toString(36) +
            Math.random()
              .toString(36)
              .substring(2, 7);

          const product = {
            id,
            name,
            price,
            stock,
            description,
          };

          products.push(product);

          saveProducts(products);

          await interaction.reply({
            content:
              "✅ **تم إضافة المنتج**\n\n" +
              `📦 الاسم: **${name}**\n` +
              `💰 السعر: **${price} ريال**\n` +
              `📊 المخزون: **${stock}**\n` +
              `📝 الوصف: **${description}**\n` +
              `🆔 ID: \`${id}\``,
            ephemeral: true,
          });

          return;
        }

        // ================================================
        // /removeproduct
        // ================================================

        if (
          interaction.commandName ===
          "removeproduct"
        ) {

          if (!isStaff(interaction)) {

            await interaction.reply({
              content: "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });

            return;
          }

          const id =
            interaction.options.getString("id");

          const products = getProducts();

          const index =
            products.findIndex(
              product =>
                product.id === id
            );

          if (index === -1) {

            await interaction.reply({
              content:
                "❌ لم أجد منتج بهذا الـID.",
              ephemeral: true,
            });

            return;
          }

          const removed =
            products[index];

          products.splice(index, 1);

          saveProducts(products);

          await interaction.reply({
            content:
              "🗑️ **تم حذف المنتج**\n\n" +
              `📦 المنتج: **${removed.name}**\n` +
              `🆔 ID: \`${removed.id}\``,
            ephemeral: true,
          });

          return;
        }

        // ================================================
        // /editproduct
        // ================================================

        if (
          interaction.commandName ===
          "editproduct"
        ) {

          if (!isStaff(interaction)) {

            await interaction.reply({
              content: "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });

            return;
          }

          const id =
            interaction.options.getString("id");

          const products = getProducts();

          const product =
            products.find(
              item => item.id === id
            );

          if (!product) {

            await interaction.reply({
              content:
                "❌ المنتج غير موجود.",
              ephemeral: true,
            });

            return;
          }

          const name =
            interaction.options.getString(
              "name"
            );

          const price =
            interaction.options.getNumber(
              "price"
            );

          const stock =
            interaction.options.getInteger(
              "stock"
            );

          const description =
            interaction.options.getString(
              "description"
            );

          if (
            name === null &&
            price === null &&
            stock === null &&
            description === null
          ) {

            await interaction.reply({
              content:
                "❌ حدد الشيء الذي تريد تعديله.",
              ephemeral: true,
            });

            return;
          }

          if (name !== null) {
            product.name = name;
          }

          if (price !== null) {
            product.price = price;
          }

          if (stock !== null) {
            product.stock = stock;
          }

          if (description !== null) {
            product.description =
              description;
          }

          saveProducts(products);

          await interaction.reply({
            content:
              "✅ **تم تعديل المنتج**\n\n" +
              `📦 الاسم: **${product.name}**\n` +
              `💰 السعر: **${product.price} ريال**\n` +
              `📊 المخزون: **${product.stock}**\n` +
              `📝 الوصف: **${product.description}**\n` +
              `🆔 ID: \`${product.id}\``,
            ephemeral: true,
          });

          return;
        }

        // ================================================
        // /stock
        // ================================================

        if (
          interaction.commandName ===
          "stock"
        ) {

          if (!isStaff(interaction)) {

            await interaction.reply({
              content: "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });

            return;
          }

          const products = getProducts();

          if (products.length === 0) {

            await interaction.reply({
              content:
                "📦 لا توجد منتجات.",
              ephemeral: true,
            });

            return;
          }

          let text =
            "📊 **مخزون المتجر**\n\n";

          for (const product of products) {

            text +=
              `📦 **${product.name}**\n` +
              `💰 ${product.price} ريال\n` +
              `📊 المخزون: **${product.stock}**\n` +
              `🆔 \`${product.id}\`\n\n`;

          }

          await interaction.reply({
            content: text.slice(0, 4000),
            ephemeral: true,
          });

          return;
        }

        return;
      }

      // ==================================================
      // PRODUCT SELECT
      // ==================================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "select_product"
      ) {

        const selectedId =
          interaction.values[0];

        if (selectedId === "none") {

          await interaction.reply({
            content:
              "❌ لا توجد منتجات متوفرة.",
            ephemeral: true,
          });

          return;
        }

        const products = getProducts();

        const product =
          products.find(
            item =>
              item.id === selectedId
          );

        if (!product) {

          await interaction.reply({
            content:
              "❌ المنتج غير موجود.",
            ephemeral: true,
          });

          return;
        }

        if (Number(product.stock) <= 0) {

          await interaction.reply({
            content:
              "❌ المنتج نفد من المخزون.",
            ephemeral: true,
          });

          return;
        }

        await interaction.deferReply({
          ephemeral: true,
        });

        // ==============================================
        // CHANNEL NAME
        // ==============================================

        const safeUsername =
          interaction.user.username
            .toLowerCase()
            .replace(/[^a-z0-9-_]/g, "")
            .slice(0, 18) ||
          "customer";

        const channelName =
          `order-${safeUsername}`;

        // ==============================================
        // PERMISSIONS
        // ==============================================

        const overwrites = [

          {
            id:
              interaction.guild.roles
                .everyone.id,

            deny: [
              PermissionFlagsBits.ViewChannel,
            ],
          },

          {
            id:
              interaction.user.id,

            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles,
            ],
          },

        ];

        // رتبة الإدارة
        if (env.STAFF_ROLE_ID) {

          overwrites.push({

            id: env.STAFF_ROLE_ID,

            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],

          });

        }

        // ==============================================
        // CREATE TICKET
        // ==============================================

        const channel =
          await interaction.guild.channels.create({

            name: channelName,

            type:
              ChannelType.GuildText,

            parent:
              env.ORDERS_CATEGORY_ID ||
              null,

            permissionOverwrites:
              overwrites,

          });

        // ==============================================
        // ORDER EMBED
        // ==============================================

        const orderEmbed =
          new EmbedBuilder()
            .setTitle("🧾 طلب جديد")
            .setDescription(

              `**👤 العميل:** <@${interaction.user.id}>\n` +
              `**📦 المنتج:** ${product.name}\n` +
              `**💰 السعر:** ${product.price} ريال\n` +
              `**📊 المخزون:** ${product.stock}\n` +
              `**🟡 الحالة:** بانتظار الدفع`

            )
            .setFooter({
              text:
                "Soork Store • Order",
            });

        // ==============================================
        // SEND ORDER
        // ==============================================

        await channel.send({

          content:
            `<@${interaction.user.id}>` +
            (
              env.STAFF_ROLE_ID
                ? ` <@&${env.STAFF_ROLE_ID}>`
                : ""
            ),

          embeds: [
            orderEmbed,
            paymentEmbed(product),
          ],

          components: [
            orderButtons(),
          ],

        });

        await interaction.editReply({

          content:
            `✅ تم إنشاء التكت بنجاح.\n\n` +
            `🎫 ${channel}`,

        });

        return;
      }

      // ==================================================
      // BUTTONS
      // ==================================================

      if (interaction.isButton()) {

        // ================================================
        // PROOF
        // ================================================

        if (
          interaction.customId ===
          "proof"
        ) {

          await interaction.reply({

            content:
              "📤 **ارفع إثبات التحويل هنا في التكت.**\n\n" +
              "يمكنك إرسال صورة أو ملف التحويل مباشرة في هذه القناة.\n\n" +
              "بعدها انتظر الإدارة لتأكيد الدفع.",

            ephemeral: true,

          });

          return;
        }

        // ================================================
        // APPROVE
        // ================================================

        if (
          interaction.customId ===
          "approve"
        ) {

          if (!isStaff(interaction)) {

            await interaction.reply({

              content:
                "❌ هذا الزر للإدارة فقط.",

              ephemeral: true,

            });

            return;
          }

          // البحث عن رسالة الطلب
          const messages =
            await interaction.channel.messages.fetch({
              limit: 50,
            });

          let productName = null;

          for (
            const [, message]
            of messages
          ) {

            for (
              const embed
              of message.embeds
            ) {

              if (
                embed.title ===
                  "🧾 طلب جديد" &&
                embed.description
              ) {

                const match =
                  embed.description.match(
                    /\*\*📦 المنتج:\*\* (.+)/
                  );

                if (match) {
                  productName =
                    match[1].trim();
                }

              }

            }

          }

          if (!productName) {

            await interaction.reply({

              content:
                "❌ لم أستطع معرفة المنتج من الطلب.",

              ephemeral: true,

            });

            return;
          }

          const products =
            getProducts();

          const product =
            products.find(
              item =>
                item.name ===
                productName
            );

          if (!product) {

            await interaction.reply({

              content:
                "❌ المنتج غير موجود في قاعدة البيانات.",

              ephemeral: true,

            });

            return;
          }

          // ==============================================
          // CHECK STOCK
          // ==============================================

          if (
            Number(product.stock) <= 0
          ) {

            await interaction.reply({

              content:
                "❌ لا يمكن تأكيد الطلب، المنتج نفد من المخزون.",

              ephemeral: true,

            });

            return;
          }

          // ==============================================
          // REMOVE STOCK
          // ==============================================

          product.stock =
            Number(product.stock) - 1;

          saveProducts(products);

          // ==============================================
          // APPROVED MESSAGE
          // ==============================================

          const approvedEmbed =
            new EmbedBuilder()
              .setTitle(
                "✅ تم تأكيد الدفع"
              )
              .setDescription(

                `**🟢 الحالة:** تم تأكيد الدفع\n` +
                `**📦 المنتج:** ${product.name}\n` +
                `**💰 السعر:** ${product.price} ريال\n` +
                `**👮 بواسطة:** <@${interaction.user.id}>\n` +
                `**📊 المخزون المتبقي:** ${product.stock}`

              )
              .setFooter({
                text:
                  "Soork Store",
              });

          await interaction.channel.send({

            embeds: [
              approvedEmbed,
            ],

          });

          await interaction.reply({

            content:
              "✅ تم تأكيد الدفع وخصم المنتج من المخزون.",

            ephemeral: true,

          });

          return;
        }

        // ================================================
        // REJECT
        // ================================================

        if (
          interaction.customId ===
          "reject"
        ) {

          if (!isStaff(interaction)) {

            await interaction.reply({

              content:
                "❌ هذا الزر للإدارة فقط.",

              ephemeral: true,

            });

            return;
          }

          const rejectedEmbed =
            new EmbedBuilder()
              .setTitle(
                "❌ تم رفض إثبات الدفع"
              )
              .setDescription(

                `**🔴 الحالة:** تم رفض الإثبات\n` +
                `**👮 بواسطة:** <@${interaction.user.id}>\n\n` +
                "يرجى إرسال إثبات صحيح إذا كان لديك تحويل فعلي."

              )
              .setFooter({
                text:
                  "Soork Store",
              });

          await interaction.channel.send({

            embeds: [
              rejectedEmbed,
            ],

          });

          await interaction.reply({

            content:
              "❌ تم رفض إثبات الدفع.",

            ephemeral: true,

          });

          return;
        }

        // ================================================
        // CLOSE
        // ================================================

        if (
          interaction.customId ===
          "close"
        ) {

          if (!isStaff(interaction)) {

            await interaction.reply({

              content:
                "❌ هذا الزر للإدارة فقط.",

              ephemeral: true,

            });

            return;
          }

          await interaction.reply(
            "🔒 سيتم إغلاق التكت خلال 5 ثوانٍ."
          );

          setTimeout(() => {

            interaction.channel
              .delete()
              .catch(() => {});

          }, 5000);

          return;
        }

      }

    } catch (error) {

      console.error(
        "❌ Interaction error:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {

        await interaction.reply({

          content:
            "❌ حدث خطأ غير متوقع.",

          ephemeral: true,

        }).catch(() => {});

      }

    }

  }
);

// ======================================================
// LOGIN
// ======================================================

client.login(
  env.DISCORD_TOKEN
);
