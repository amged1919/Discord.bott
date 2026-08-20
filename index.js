require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
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
  UserSelectMenuBuilder,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =========================
// Environment
// =========================

const env = process.env;

if (!env.DISCORD_TOKEN || !env.GUILD_ID) {
  console.error("❌ ضع DISCORD_TOKEN و GUILD_ID في Railway Variables");
  process.exit(1);
}

// =========================
// Data
// =========================

const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const productsFile = path.join(dataDir, "products.json");
const configFile = path.join(dataDir, "config.json");
const statsFile = path.join(dataDir, "stats.json");

if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(productsFile, "[]", "utf8");
}

if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, "{}", "utf8");
}

if (!fs.existsSync(statsFile)) {
  fs.writeFileSync(
    statsFile,
    JSON.stringify(
      {
        orders: 0,
        sales: 0,
        revenue: 0,
      },
      null,
      2
    ),
    "utf8"
  );
}

// =========================
// JSON Functions
// =========================

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error("JSON Error:", error);
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function getProducts() {
  return readJSON(productsFile, []);
}

function saveProducts(products) {
  writeJSON(productsFile, products);
}

function getConfig() {
  const config = readJSON(configFile, {});

  return {
    staffRoleId:
      config.staffRoleId ||
      env.STAFF_ROLE_ID ||
      "",

    ticketCategoryId:
      config.ticketCategoryId ||
      env.TICKET_CATEGORY_ID ||
      "",

    ticketLogChannelId:
      config.ticketLogChannelId ||
      env.TICKET_LOG_CHANNEL_ID ||
      "",

    ordersCategoryId:
      config.ordersCategoryId ||
      env.ORDERS_CATEGORY_ID ||
      "",

    maintenance:
      Boolean(config.maintenance),

    storeName:
      config.storeName ||
      env.STORE_NAME ||
      "Soork Store",

    rajhiBankName:
      config.rajhiBankName ||
      env.RAJHI_BANK_NAME ||
      "مصرف الراجحي",

    rajhiAccountName:
      config.rajhiAccountName ||
      env.RAJHI_ACCOUNT_NAME ||
      "غير مضبوط",

    rajhiIban:
      config.rajhiIban ||
      env.RAJHI_IBAN ||
      "غير مضبوط",
  };
}

function saveConfig(config) {
  writeJSON(configFile, config);
}

function getStats() {
  return readJSON(statsFile, {
    orders: 0,
    sales: 0,
    revenue: 0,
  });
}

function saveStats(stats) {
  writeJSON(statsFile, stats);
}

// =========================
// Client
// =========================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
  ],
});

// =========================
// Permissions
// =========================

function isStaff(interaction) {
  if (!interaction.member) return false;

  const config = getConfig();

  if (
    config.staffRoleId &&
    interaction.member.roles?.cache?.has(
      config.staffRoleId
    )
  ) {
    return true;
  }

  return false;
}

function isAdmin(interaction) {
  if (
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild
    )
  ) {
    return true;
  }

  return isStaff(interaction);
}

// =========================
// Store
// =========================

function storeEmbed() {
  const config = getConfig();

  return new EmbedBuilder()
    .setTitle(`🛒 ${config.storeName}`)
    .setDescription(
      config.maintenance
        ? "🔧 **المتجر في وضع الصيانة حاليًا.**"
        : "اختر المنتج من القائمة لفتح طلب خاص.\n\n" +
          "بعد إنشاء الطلب ستظهر لك بيانات تحويل الراجحي، " +
          "ثم ترفع إثبات الدفع.\n\n" +
          "⚠️ لا يعتبر الطلب مدفوعًا حتى يتم تأكيده من الإدارة."
    )
    .setFooter({
      text: "Soork Store • Payment & Orders",
    });
}

function productMenu() {
  const products = getProducts()
    .filter(
      product => Number(product.stock) > 0
    )
    .slice(0, 25);

  const menu =
    new StringSelectMenuBuilder()
      .setCustomId("select_product")
      .setPlaceholder("🛒 اختر المنتج");

  if (!products.length) {
    menu.addOptions([
      {
        label: "لا توجد منتجات متوفرة",
        description: "لا يوجد مخزون حاليًا",
        value: "none",
      },
    ]);
  } else {
    menu.addOptions(
      products.map(product => ({
        label:
          `${product.name} - ${product.price} ريال`
            .slice(0, 100),

        description:
          String(
            product.description ||
              "بدون وصف"
          ).slice(0, 100),

        value: product.id,
      }))
    );
  }

  return menu;
}

// =========================
// Payment
// =========================

function paymentEmbed(product) {
  const config = getConfig();

  return new EmbedBuilder()
    .setTitle("💳 طريقة الدفع — تحويل الراجحي")
    .setDescription(
      `**البنك:** ${config.rajhiBankName}\n` +
      `**اسم صاحب الحساب:** ${config.rajhiAccountName}\n` +
      `**الآيبان:** \`${config.rajhiIban}\`\n` +
      `**المبلغ المطلوب:** **${product.price} ريال**\n\n` +
      "بعد التحويل ارفع صورة أو ملف إثبات التحويل في نفس الطلب.\n\n" +
      "⚠️ لا يعتبر الطلب مدفوعًا حتى يتم تأكيده من الإدارة."
    )
    .setFooter({
      text: "Soork Store",
    });
}

// =========================
// Order Buttons
// =========================

function orderButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("proof")
      .setLabel("إرسال إثبات الدفع")
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
      .setCustomId("close_order")
      .setLabel("إغلاق الطلب")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)
  );
}

// =========================
// Ticket Panel
// =========================

function ticketPanel() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_buy")
      .setLabel("شراء")
      .setEmoji("🛒")
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId("ticket_payment")
      .setLabel("دفع")
      .setEmoji("💳")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("ticket_support")
      .setLabel("دعم فني")
      .setEmoji("🛠️")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("ticket_question")
      .setLabel("استفسار")
      .setEmoji("❓")
      .setStyle(ButtonStyle.Secondary)
  );
}

// =========================
// Ticket Buttons
// =========================

function ticketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("إغلاق التكت")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId("ticket_add")
      .setLabel("إضافة عضو")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId("ticket_remove")
      .setLabel("إزالة عضو")
      .setEmoji("➖")
      .setStyle(ButtonStyle.Secondary)
  );
}

// =========================
// Slash Commands
// =========================

const commands = [
  new SlashCommandBuilder()
    .setName("store")
    .setDescription("عرض المتجر"),

  new SlashCommandBuilder()
    .setName("products")
    .setDescription("عرض المنتجات"),

  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("إرسال لوحة المتجر")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

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
        .setDescription("السعر")
        .setMinValue(0)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("stock")
        .setDescription("المخزون")
        .setMinValue(0)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("وصف المنتج")
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
    )
    .addNumberOption(option =>
      option
        .setName("price")
        .setDescription("السعر الجديد")
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName("stock")
        .setDescription("المخزون الجديد")
        .setMinValue(0)
    )
    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("الوصف الجديد")
    ),

  new SlashCommandBuilder()
    .setName("stock")
    .setDescription("عرض المخزون")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("إحصائيات المتجر")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("maintenance")
    .setDescription("تشغيل أو إيقاف الصيانة")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addBooleanOption(option =>
      option
        .setName("enabled")
        .setDescription("تشغيل الصيانة؟")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setstaff")
    .setDescription("تحديد رتبة إدارة المتجر")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addRoleOption(option =>
      option
        .setName("role")
        .setDescription("رتبة الإدارة")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setpayment")
    .setDescription("تعديل بيانات الدفع")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addStringOption(option =>
      option
        .setName("account_name")
        .setDescription("اسم صاحب الحساب")
    )
    .addStringOption(option =>
      option
        .setName("iban")
        .setDescription("الآيبان")
    )
    .addStringOption(option =>
      option
        .setName("bank_name")
        .setDescription("اسم البنك")
    ),

  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("إرسال لوحة التكت")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    ),

  new SlashCommandBuilder()
    .setName("setticket")
    .setDescription("إعداد نظام التكت")
    .setDefaultMemberPermissions(
      PermissionFlagsBits.ManageGuild
    )
    .addChannelOption(option =>
      option
        .setName("category")
        .setDescription("تصنيف التكت")
        .addChannelTypes(
          ChannelType.GuildCategory
        )
        .setRequired(true)
    )
    .addChannelOption(option =>
      option
        .setName("logs")
        .setDescription("قناة لوق التكت")
        .addChannelTypes(
          ChannelType.GuildText
        )
        .setRequired(true)
    ),
].map(command => command.toJSON());

// =========================
// Ready
// =========================

client.once("ready", async () => {
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

    console.log(
      `✅ Logged in as ${client.user.tag}`
    );

    console.log(
      "✅ Commands registered successfully."
    );
  } catch (error) {
    console.error(
      "❌ Command registration error:",
      error
    );
  }
});

// =========================
// Create Ticket
// =========================

async function createTicket(
  interaction,
  type
) {
  const config = getConfig();

  if (!config.ticketCategoryId) {
    return interaction.reply({
      content:
        "❌ لم يتم إعداد تصنيف التكت.\nاستخدم `/setticket` أولًا.",
      ephemeral: true,
    });
  }

  const existing =
    interaction.guild.channels.cache.find(
      channel =>
        channel.type === ChannelType.GuildText &&
        channel.parentId ===
          config.ticketCategoryId &&
        channel.topic ===
          `ticket-owner:${interaction.user.id}`
    );

  if (existing) {
    return interaction.reply({
      content:
        `❌ لديك تكت مفتوح بالفعل: ${existing}`,
      ephemeral: true,
    });
  }

  const typeNames = {
    buy: "شراء",
    payment: "دفع",
    support: "دعم فني",
    question: "استفسار",
  };

  const overwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel,
      ],
    },

    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (config.staffRoleId) {
    overwrites.push({
      id: config.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    });
  }

  const channel =
    await interaction.guild.channels.create({
      name:
        `ticket-${type}-${interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "")
          .slice(0, 15) || "user"}`,

      type: ChannelType.GuildText,

      parent: config.ticketCategoryId,

      topic:
        `ticket-owner:${interaction.user.id}`,

      permissionOverwrites: overwrites,
    });

  const embed =
    new EmbedBuilder()
      .setTitle(
        `🎫 تكت ${typeNames[type]}`
      )
      .setDescription(
        `أهلًا <@${interaction.user.id}> 👋\n\n` +
        "اكتب طلبك هنا وسيتم الرد عليك من الإدارة.\n\n" +
        "عند الانتهاء اضغط **إغلاق التكت**."
      )
      .setFooter({
        text: "Soork Store • Tickets",
      });

  await channel.send({
    content:
      `<@${interaction.user.id}>` +
      (config.staffRoleId
        ? ` <@&${config.staffRoleId}>`
        : ""),

    embeds: [embed],

    components: [
      ticketButtons(),
    ],
  });

  await interaction.reply({
    content:
      `✅ تم فتح التكت بنجاح: ${channel}`,
    ephemeral: true,
  });
}

// =========================
// Interaction Handler
// =========================

client.on(
  "interactionCreate",
  async interaction => {
    try {
      // =========================
      // Slash Commands
      // =========================

      if (
        interaction.isChatInputCommand()
      ) {
        // STORE
        if (
          interaction.commandName ===
          "store"
        ) {
          if (
            getConfig().maintenance &&
            !isAdmin(interaction)
          ) {
            return interaction.reply({
              content:
                "🔧 المتجر في وضع الصيانة.",
              ephemeral: true,
            });
          }

          return interaction.reply({
            embeds: [storeEmbed()],
            components: [
              new ActionRowBuilder().addComponents(
                productMenu()
              ),
            ],
          });
        }

        // SETUP
        if (
          interaction.commandName ===
          "setup"
        ) {
          if (!isAdmin(interaction)) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });
          }

          return interaction.reply({
            embeds: [storeEmbed()],
            components: [
              new ActionRowBuilder().addComponents(
                productMenu()
              ),
            ],
          });
        }

        // PRODUCTS
        if (
          interaction.commandName ===
          "products"
        ) {
          const products =
            getProducts();

          if (!products.length) {
            return interaction.reply({
              content:
                "📦 لا توجد منتجات حاليًا.",
              ephemeral: true,
            });
          }

          const text =
            products
              .map(
                product =>
                  `**${product.name}**\n` +
                  `🆔 \`${product.id}\`\n` +
                  `💰 ${product.price} ريال\n` +
                  `📦 المخزون: ${product.stock}\n` +
                  `📝 ${
                    product.description ||
                    "بدون وصف"
                  }`
              )
              .join("\n\n");

          return interaction.reply({
            content: text.slice(0, 4000),
            ephemeral: true,
          });
        }

        // ADD PRODUCT
        if (
          interaction.commandName ===
          "addproduct"
        ) {
          if (!isAdmin(interaction)) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });
          }

          const products =
            getProducts();

          const product = {
            id:
              `${Date.now().toString(36)}` +
              `${Math.random()
                .toString(36)
                .slice(2, 6)}`,

            name:
              interaction.options.getString(
                "name"
              ),

            price:
              interaction.options.getNumber(
                "price"
              ),

            stock:
              interaction.options.getInteger(
                "stock"
              ),

            description:
              interaction.options.getString(
                "description"
              ) ||
              "بدون وصف",
          };

          products.push(product);

          saveProducts(products);

          return interaction.reply({
            content:
              `✅ تم إضافة المنتج.\n\n` +
              `📦 ${product.name}\n` +
              `💰 ${product.price} ريال\n` +
              `📊 المخزون: ${product.stock}\n` +
              `🆔 \`${product.id}\``,

            ephemeral: true,
          });
        }

        // REMOVE PRODUCT
        if (
          interaction.commandName ===
          "removeproduct"
        ) {
          if (!isAdmin(interaction)) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });
          }

          const id =
            interaction.options.getString(
              "id"
            );

          const products =
            getProducts();

          const index =
            products.findIndex(
              product =>
                product.id === id
            );

          if (index === -1) {
            return interaction.reply({
              content:
                "❌ المنتج غير موجود.",
              ephemeral: true,
            });
          }

          const removed =
            products[index];

          products.splice(index, 1);

          saveProducts(products);

          return interaction.reply({
            content:
              `🗑️ تم حذف المنتج **${removed.name}**.`,
            ephemeral: true,
          });
        }

        // EDIT PRODUCT
        if (
          interaction.commandName ===
          "editproduct"
        ) {
          if (!isAdmin(interaction)) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });
          }

          const id =
            interaction.options.getString(
              "id"
            );

          const products =
            getProducts();

          const product =
            products.find(
              item =>
                item.id === id
            );

          if (!product) {
            return interaction.reply({
              content:
                "❌ المنتج غير موجود.",
              ephemeral: true,
            });
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
            return interaction.reply({
              content:
                "❌ حدد شيء واحد على الأقل للتعديل.",
              ephemeral: true,
            });
          }

          if (name !== null)
            product.name = name;

          if (price !== null)
            product.price = price;

          if (stock !== null)
            product.stock = stock;

          if (description !== null)
            product.description =
              description;

          saveProducts(products);

          return interaction.reply({
            content:
              `✅ تم تعديل المنتج.\n\n` +
              `📦 ${product.name}\n` +
              `💰 ${product.price} ريال\n` +
              `📦 المخزون: ${product.stock}`,

            ephemeral: true,
          });
        }

        // STOCK
        if (
          interaction.commandName ===
          "stock"
        ) {
          if (!isAdmin(interaction)) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });
          }

          const products =
            getProducts();

          if (!products.length) {
            return interaction.reply({
              content:
                "📦 لا توجد منتجات.",
              ephemeral: true,
            });
          }

          const text =
            products
              .map(
                product =>
                  `📦 **${product.name}**\n` +
                  `💰 ${product.price} ريال\n` +
                  `📊 المخزون: ${product.stock}\n` +
                  `🆔 \`${product.id}\``
              )
              .join("\n\n");

          return interaction.reply({
            content:
              `📊 **مخزون المتجر**\n\n${text}`,
            ephemeral: true,
          });
        }

        // STATS
        if (
          interaction.commandName ===
          "stats"
        ) {
          if (!isAdmin(interaction)) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });
          }

          const stats =
            getStats();

          const embed =
            new EmbedBuilder()
              .setTitle(
                "📊 إحصائيات المتجر"
              )
              .addFields(
                {
                  name: "🧾 الطلبات",
                  value:
                    String(
                      stats.orders
                    ),
                  inline: true,
                },
                {
                  name: "💰 المبيعات",
                  value:
                    String(
                      stats.sales
                    ),
                  inline: true,
                },
                {
                  name: "💵 الإيرادات",
                  value:
                    `${stats.revenue} ريال`,
                  inline: true,
                }
              );

          return interaction.reply({
            embeds: [embed],
            ephemeral: true,
          });
        }

        // MAINTENANCE
        if (
          interaction.commandName ===
          "maintenance"
        ) {
          if (!isAdmin(interaction)) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });
          }

          const config =
            getConfig();

          config.maintenance =
            interaction.options.getBoolean(
              "enabled"
            );

          saveConfig(config);

          return interaction.reply({
            content:
              config.maintenance
                ? "🔧 تم تشغيل وضع الصيانة."
                : "✅ تم إيقاف وضع الصيانة.",

            ephemeral: true,
          });
        }

        // SET STAFF
        if (
          interaction.commandName ===
          "setstaff"
        ) {
          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة العليا فقط.",
              ephemeral: true,
            });
          }

          const role =
            interaction.options.getRole(
              "role"
            );

          const config =
            getConfig();

          config.staffRoleId =
            role.id;

          saveConfig(config);

          return interaction.reply({
            content:
              `✅ تم تحديد رتبة الإدارة: ${role}`,
            ephemeral: true,
          });
        }

        // SET PAYMENT
        if (
          interaction.commandName ===
          "setpayment"
        ) {
          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة العليا فقط.",
              ephemeral: true,
            });
          }

          const config =
            getConfig();

          const accountName =
            interaction.options.getString(
              "account_name"
            );

          const iban =
            interaction.options.getString(
              "iban"
            );

          const bankName =
            interaction.options.getString(
              "bank_name"
            );

          if (accountName !== null)
            config.rajhiAccountName =
              accountName;

          if (iban !== null)
            config.rajhiIban =
              iban;

          if (bankName !== null)
            config.rajhiBankName =
              bankName;

          saveConfig(config);

          return interaction.reply({
            content:
              "✅ تم تحديث بيانات الدفع.",
            ephemeral: true,
          });
        }

        // TICKET
        if (
          interaction.commandName ===
          "ticket"
        ) {
          if (!isAdmin(interaction)) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة فقط.",
              ephemeral: true,
            });
          }

          return interaction.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle(
                  "🎫 نظام التذاكر"
                )
                .setDescription(
                  "اختر نوع التكت المناسب لك:"
                ),
            ],

            components: [
              ticketPanel(),
            ],
          });
        }

        // SET TICKET
        if (
          interaction.commandName ===
          "setticket"
        ) {
          if (
            !interaction.memberPermissions?.has(
              PermissionFlagsBits.ManageGuild
            )
          ) {
            return interaction.reply({
              content:
                "❌ هذا الأمر للإدارة العليا فقط.",
              ephemeral: true,
            });
          }

          const config =
            getConfig();

          config.ticketCategoryId =
            interaction.options.getChannel(
              "category"
            ).id;

          config.ticketLogChannelId =
            interaction.options.getChannel(
              "logs"
            ).id;

          saveConfig(config);

          return interaction.reply({
            content:
              "✅ تم حفظ إعدادات التكت.",
            ephemeral: true,
          });
        }
      }

      // =========================
      // Product Menu
      // =========================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId ===
          "select_product"
      ) {
        if (
          interaction.values[0] ===
          "none"
        ) {
          return interaction.reply({
            content:
              "❌ لا توجد منتجات.",
            ephemeral: true,
          });
        }

        const products =
          getProducts();

        const product =
          products.find(
            p =>
              p.id ===
              interaction.values[0]
          );

        if (!product) {
          return interaction.reply({
            content:
              "❌ المنتج غير موجود.",
            ephemeral: true,
          });
        }

        if (
          Number(product.stock) <=
          0
        ) {
          return interaction.reply({
            content:
              "❌ المنتج نفد من المخزون.",
            ephemeral: true,
          });
        }

        await interaction.deferReply({
          ephemeral: true,
        });

        const config =
          getConfig();

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

        if (
          config.staffRoleId
        ) {
          overwrites.push({
            id:
              config.staffRoleId,

            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
            ],
          });
        }

        const channel =
          await interaction.guild.channels.create(
            {
              name:
                `order-${interaction.user.username
                  .toLowerCase()
                  .replace(
                    /[^a-z0-9-]/g,
                    ""
                  )
                  .slice(0, 18) ||
                  "customer"`,

              type:
                ChannelType.GuildText,

              parent:
                config.ordersCategoryId ||
                null,

              topic:
                `order-owner:${interaction.user.id};product:${product.id}`,

              permissionOverwrites:
                overwrites,
            }
          );

        const orderEmbed =
          new EmbedBuilder()
            .setTitle(
              "🧾 طلب جديد"
            )
            .setDescription(
              `**العميل:** <@${interaction.user.id}>\n` +
              `**المنتج:** ${product.name}\n` +
              `**السعر:** ${product.price} ريال\n` +
              `**الحالة:** 🟡 بانتظار الدفع`
            );

        await channel.send({
          content:
            `<@${interaction.user.id}>` +
            (
              config.staffRoleId
                ? ` <@&${config.staffRoleId}>`
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

        const stats =
          getStats();

        stats.orders++;

        saveStats(stats);

        return interaction.editReply({
          content:
            `✅ تم إنشاء الطلب: ${channel}`,
        });
      }

      // =========================
      // Buttons
      // =========================

      if (
        interaction.isButton()
      ) {
        // TICKET CREATE

        if (
          [
            "ticket_buy",
            "ticket_payment",
            "ticket_support",
            "ticket_question",
          ].includes(
            interaction.customId
          )
        ) {
          const typeMap = {
            ticket_buy: "buy",
            ticket_payment:
              "payment",

            ticket_support:
              "support",

            ticket_question:
              "question",
          };

          return createTicket(
            interaction,
            typeMap[
              interaction.customId
            ]
          );
        }

        // PROOF

        if (
          interaction.customId ===
          "proof"
        ) {
          return interaction.reply({
            content:
              "📤 ارفع الآن صورة أو ملف إثبات التحويل في هذه القناة.\n\n" +
              "بعد رفع الإثبات انتظر تأكيد الإدارة.",
            ephemeral: true,
          });
        }

        // APPROVE / REJECT

        if (
          [
            "approve",
            "reject",
          ].includes(
            interaction.customId
          )
        ) {
          if (
            !isStaff(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ هذا الزر لرتبة الإدارة المحددة فقط.",
              ephemeral: true,
            });
          }

          const productId =
            interaction.channel.topic
              ?.match(
                /product:([^;]+)/
              )?.[1];

          const products =
            getProducts();

          const product =
            products.find(
              p =>
                p.id ===
                productId
            );

          if (
            interaction.customId ===
            "approve"
          ) {
            if (!product) {
              return interaction.reply({
                content:
                  "❌ لم أجد المنتج المرتبط بالطلب.",
                ephemeral: true,
              });
            }

            if (
              Number(
                product.stock
              ) <= 0
            ) {
              return interaction.reply({
                content:
                  "❌ المخزون أصبح 0.",
                ephemeral: true,
              });
            }

            product.stock =
              Number(
                product.stock
              ) - 1;

            saveProducts(
              products
            );

            const stats =
              getStats();

            stats.sales++;
            stats.revenue +=
              Number(
                product.price
              );

            saveStats(stats);

            await interaction.channel.send(
              {
                embeds: [
                  new EmbedBuilder()
                    .setTitle(
                      "✅ تم تأكيد الدفع"
                    )
                    .setDescription(
                      `**المنتج:** ${product.name}\n` +
                      `**المبلغ:** ${product.price} ريال\n` +
                      `**بواسطة:** <@${interaction.user.id}>\n` +
                      `**المخزون المتبقي:** ${product.stock}`
                    ),
                ],
              }
            );

            return interaction.reply({
              content:
                "✅ تم تأكيد الدفع وخصم المنتج من المخزون.",
              ephemeral: true,
            });
          }

          await interaction.channel.send(
            {
              embeds: [
                new EmbedBuilder()
                  .setTitle(
                    "❌ تم رفض إثبات الدفع"
                  )
                  .setDescription(
                    `**بواسطة:** <@${interaction.user.id}>`
                  ),
              ],
            }
          );

          return interaction.reply({
            content:
              "❌ تم رفض إثبات الدفع.",
            ephemeral: true,
          });
        }

        // CLOSE ORDER

        if (
          interaction.customId ===
          "close_order"
        ) {
          const isOwner =
            interaction.channel.topic ===
            `order-owner:${interaction.user.id}`;

          if (
            !isStaff(interaction) &&
            !isOwner
          ) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية إغلاق الطلب.",
              ephemeral: true,
            });
          }

          await interaction.reply(
            "🔒 سيتم إغلاق الطلب خلال 5 ثوانٍ."
          );

          return setTimeout(
            () =>
              interaction.channel
                .delete()
                .catch(() => {}),
            5000
          );
        }

        // CLOSE TICKET

        if (
          interaction.customId ===
          "ticket_close"
        ) {
          const config =
            getConfig();

          if (
            !isStaff(interaction) &&
            interaction.channel.topic !==
              `ticket-owner:${interaction.user.id}`
          ) {
            return interaction.reply({
              content:
                "❌ ليس لديك صلاحية إغلاق التكت.",
              ephemeral: true,
            });
          }

          await interaction.reply(
            "🔒 سيتم إغلاق التكت خلال 5 ثوانٍ."
          );

          if (
            config.ticketLogChannelId
          ) {
            const log =
              interaction.guild.channels.cache.get(
                config.ticketLogChannelId
              );

            if (
              log?.isTextBased()
            ) {
              await log.send({
                content:
                  `🧾 تم إغلاق التكت **${interaction.channel.name}**\n` +
                  `👤 بواسطة: <@${interaction.user.id}>`,
              }).catch(() => {});
            }
          }

          return setTimeout(
            () =>
              interaction.channel
                .delete()
                .catch(() => {}),
            5000
          );
        }

        // ADD / REMOVE MEMBER

        if (
          [
            "ticket_add",
            "ticket_remove",
          ].includes(
            interaction.customId
          )
        ) {
          if (
            !isStaff(interaction)
          ) {
            return interaction.reply({
              content:
                "❌ هذا الزر للإدارة فقط.",
              ephemeral: true,
            });
          }

          return interaction.reply({
            content:
              "👤 استخدم منشن العضو في التكت، وسأضيف لك نظام اختيار العضو في النسخة التالية.",
            ephemeral: true,
          });
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
        await interaction
          .reply({
            content:
              "❌ حدث خطأ غير متوقع.",
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  }
);

// =========================
// Login
// =========================

client.login(
  env.DISCORD_TOKEN
);
