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
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// =========================
// Environment
// =========================

const env = process.env;

if (!env.DISCORD_TOKEN || !env.GUILD_ID) {
  console.error("ضع DISCORD_TOKEN و GUILD_ID في Railway Variables");
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

if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(productsFile, "[]", "utf8");
}

function getProducts() {
  try {
    return JSON.parse(fs.readFileSync(productsFile, "utf8"));
  } catch (error) {
    console.error("خطأ في قراءة products.json:", error);
    return [];
  }
}

function saveProducts(products) {
  fs.writeFileSync(
    productsFile,
    JSON.stringify(products, null, 2),
    "utf8"
  );
}

// =========================
// Client
// =========================

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

// =========================
// Commands
// =========================

const commands = [
  // المتجر
  new SlashCommandBuilder()
    .setName("store")
    .setDescription("عرض متجر Soork Store"),

  // المنتجات
  new SlashCommandBuilder()
    .setName("products")
    .setDescription("عرض جميع المنتجات"),

  // إعداد المتجر
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("إرسال لوحة المتجر")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // إضافة منتج
  new SlashCommandBuilder()
    .setName("addproduct")
    .setDescription("إضافة منتج جديد")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("name")
        .setDescription("اسم المنتج")
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName("price")
        .setDescription("سعر المنتج بالريال")
        .setRequired(true)
        .setMinValue(0)
    )
    .addIntegerOption(option =>
      option
        .setName("stock")
        .setDescription("عدد المنتجات في المخزون")
        .setRequired(true)
        .setMinValue(0)
    )
    .addStringOption(option =>
      option
        .setName("description")
        .setDescription("وصف المنتج")
        .setRequired(false)
    ),

  // حذف منتج
  new SlashCommandBuilder()
    .setName("removeproduct")
    .setDescription("حذف منتج")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("معرف المنتج")
        .setRequired(true)
    ),

  // تعديل منتج
  new SlashCommandBuilder()
    .setName("editproduct")
    .setDescription("تعديل منتج")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option
        .setName("id")
        .setDescription("معرف المنتج")
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

  // عرض المخزون
  new SlashCommandBuilder()
    .setName("stock")
    .setDescription("عرض مخزون المنتجات")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(command => command.toJSON());

// =========================
// Store Embed
// =========================

function storeEmbed() {
  return new EmbedBuilder()
    .setTitle(`🛒 ${env.STORE_NAME || "Soork Store"}`)
    .setDescription(
      "اختر المنتج من القائمة لفتح طلب خاص.\n\n" +
      "بعد إنشاء الطلب ستظهر لك بيانات تحويل الراجحي، " +
      "ثم ترفع إثبات الدفع.\n\n" +
      "⚠️ لا يعتبر الطلب مدفوعًا حتى يتم تأكيده من الإدارة."
    )
    .setFooter({
      text: "Soork Store • Payment & Orders",
    });
}

// =========================
// Product Menu
// =========================

function menu() {
  const products = getProducts()
    .filter(product => Number(product.stock) > 0)
    .slice(0, 25);

  const select = new StringSelectMenuBuilder()
    .setCustomId("select_product")
    .setPlaceholder("اختر المنتج");

  if (!products.length) {
    select.addOptions([
      {
        label: "لا توجد منتجات متوفرة",
        value: "none",
      },
    ]);
  } else {
    select.addOptions(
      products.map(product => ({
        label: `${product.name} - ${product.price} ريال`.slice(0, 100),
        description: String(product.description || "بدون وصف").slice(0, 100),
        value: product.id,
      }))
    );
  }

  return select;
}

// =========================
// Payment Embed
// =========================

function paymentEmbed(product) {
  return new EmbedBuilder()
    .setTitle("💳 طريقة الدفع — تحويل الراجحي")
    .setDescription(
      `**البنك:** ${env.RAJHI_BANK_NAME || "مصرف الراجحي"}\n` +
      `**اسم صاحب الحساب:** ${
        env.RAJHI_ACCOUNT_NAME || "غير مضبوط"
      }\n` +
      `**الآيبان:** \`${env.RAJHI_IBAN || "غير مضبوط"}\`\n` +
      `**المبلغ المطلوب:** **${product.price} ريال**\n\n` +
      "بعد التحويل اضغط **إرسال إثبات الدفع** وارفع صورة أو ملف التحويل داخل الطلب.\n\n" +
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
      .setCustomId("close")
      .setLabel("إغلاق الطلب")
      .setEmoji("🔒")
      .setStyle(ButtonStyle.Secondary)
  );
}

// =========================
// Staff Check
// =========================

function isStaff(interaction) {
  if (!interaction.member) return false;

  // إدارة السيرفر
  if (
    interaction.member.permissions &&
    interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }

  // رتبة الإدارة
  if (
    env.STAFF_ROLE_ID &&
    interaction.member.roles &&
    interaction.member.roles.cache.has(env.STAFF_ROLE_ID)
  ) {
    return true;
  }

  return false;
}

// =========================
// Ready
// =========================

client.once("ready", async () => {
  try {
    const rest = new REST({ version: "10" }).setToken(
      env.DISCORD_TOKEN
    );

    await rest.put(
      Routes.applicationGuildCommands(
        client.user.id,
        env.GUILD_ID
      ),
      {
        body: commands,
      }
    );

    console.log(`Logged in as ${client.user.tag}`);
    console.log("Commands registered successfully.");
  } catch (error) {
    console.error("Command registration error:", error);
  }
});

// =========================
// Interactions
// =========================

client.on("interactionCreate", async interaction => {
  try {
    // =========================
    // Slash Commands
    // =========================

    if (interaction.isChatInputCommand()) {
      // /store
      if (interaction.commandName === "store") {
        await interaction.reply({
          embeds: [storeEmbed()],
          components: [
            new ActionRowBuilder().addComponents(menu()),
          ],
        });

        return;
      }

      // /setup
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
            new ActionRowBuilder().addComponents(menu()),
          ],
        });

        return;
      }

      // /products
      if (interaction.commandName === "products") {
        const products = getProducts();

        if (!products.length) {
          await interaction.reply({
            content: "📦 لا توجد منتجات حاليًا.",
            ephemeral: true,
          });

          return;
        }

        const text = products
          .map(
            product =>
              `**${product.name}**\n` +
              `🆔 \`${product.id}\`\n` +
              `💰 السعر: **${product.price} ريال**\n` +
              `📦 المخزون: **${product.stock}**\n` +
              `📝 ${product.description || "بدون وصف"}`
          )
          .join("\n\n");

        await interaction.reply({
          content: text.slice(0, 4000),
          ephemeral: true,
        });

        return;
      }

      // =========================
      // /addproduct
      // =========================

      if (interaction.commandName === "addproduct") {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content: "❌ هذا الأمر للإدارة فقط.",
            ephemeral: true,
          });

          return;
        }

        const name = interaction.options.getString("name");
        const price = interaction.options.getNumber("price");
        const stock = interaction.options.getInteger("stock");
        const description =
          interaction.options.getString("description") ||
          "بدون وصف";

        const products = getProducts();

        const product = {
          id: `${Date.now().toString(36)}${Math.random()
            .toString(36)
            .slice(2, 6)}`,
          name,
          price,
          stock,
          description,
        };

        products.push(product);
        saveProducts(products);

        await interaction.reply({
          content:
            `✅ تم إضافة المنتج بنجاح.\n\n` +
            `📦 **المنتج:** ${product.name}\n` +
            `💰 **السعر:** ${product.price} ريال\n` +
            `📊 **المخزون:** ${product.stock}\n` +
            `🆔 **ID:** \`${product.id}\``,
          ephemeral: true,
        });

        return;
      }

      // =========================
      // /removeproduct
      // =========================

      if (interaction.commandName === "removeproduct") {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content: "❌ هذا الأمر للإدارة فقط.",
            ephemeral: true,
          });

          return;
        }

        const id = interaction.options.getString("id");

        const products = getProducts();
        const index = products.findIndex(product => product.id === id);

        if (index === -1) {
          await interaction.reply({
            content: "❌ لم يتم العثور على المنتج بهذا الـID.",
            ephemeral: true,
          });

          return;
        }

        const removed = products[index];

        products.splice(index, 1);
        saveProducts(products);

        await interaction.reply({
          content:
            `🗑️ تم حذف المنتج بنجاح.\n\n` +
            `📦 **المنتج:** ${removed.name}\n` +
            `🆔 **ID:** \`${removed.id}\``,
          ephemeral: true,
        });

        return;
      }

      // =========================
      // /editproduct
      // =========================

      if (interaction.commandName === "editproduct") {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content: "❌ هذا الأمر للإدارة فقط.",
            ephemeral: true,
          });

          return;
        }

        const id = interaction.options.getString("id");

        const products = getProducts();
        const product = products.find(item => item.id === id);

        if (!product) {
          await interaction.reply({
            content: "❌ المنتج غير موجود.",
            ephemeral: true,
          });

          return;
        }

        const name = interaction.options.getString("name");
        const price = interaction.options.getNumber("price");
        const stock = interaction.options.getInteger("stock");
        const description =
          interaction.options.getString("description");

        if (
          name === null &&
          price === null &&
          stock === null &&
          description === null
        ) {
          await interaction.reply({
            content:
              "❌ لازم تحدد شيء واحد على الأقل تريد تعديله.",
            ephemeral: true,
          });

          return;
        }

        if (name !== null) product.name = name;
        if (price !== null) product.price = price;
        if (stock !== null) product.stock = stock;
        if (description !== null)
          product.description = description;

        saveProducts(products);

        await interaction.reply({
          content:
            `✅ تم تعديل المنتج.\n\n` +
            `📦 **الاسم:** ${product.name}\n` +
            `💰 **السعر:** ${product.price} ريال\n` +
            `📊 **المخزون:** ${product.stock}\n` +
            `📝 **الوصف:** ${product.description}\n` +
            `🆔 **ID:** \`${product.id}\``,
          ephemeral: true,
        });

        return;
      }

      // =========================
      // /stock
      // =========================

      if (interaction.commandName === "stock") {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content: "❌ هذا الأمر للإدارة فقط.",
            ephemeral: true,
          });

          return;
        }

        const products = getProducts();

        if (!products.length) {
          await interaction.reply({
            content: "📦 لا توجد منتجات.",
            ephemeral: true,
          });

          return;
        }

        const text = products
          .map(
            product =>
              `📦 **${product.name}** — ` +
              `المخزون: **${product.stock}** — ` +
              `السعر: **${product.price} ريال**\n` +
              `🆔 \`${product.id}\``
          )
          .join("\n");

        await interaction.reply({
          content: `📊 **مخزون المتجر**\n\n${text}`,
          ephemeral: true,
        });

        return;
      }

      return;
    }

    // =========================
    // Product Select Menu
    // =========================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "select_product"
    ) {
      if (interaction.values[0] === "none") {
        await interaction.reply({
          content: "❌ لا توجد منتجات متوفرة حاليًا.",
          ephemeral: true,
        });

        return;
      }

      const products = getProducts();

      const product = products.find(
        item => item.id === interaction.values[0]
      );

      if (!product) {
        await interaction.reply({
          content: "❌ المنتج غير موجود.",
          ephemeral: true,
        });

        return;
      }

      if (Number(product.stock) <= 0) {
        await interaction.reply({
          content: "❌ هذا المنتج نفد من المخزون.",
          ephemeral: true,
        });

        return;
      }

      await interaction.deferReply({
        ephemeral: true,
      });

      const safeUsername =
        interaction.user.username
          .toLowerCase()
          .replace(/[^a-z0-9-_]/g, "")
          .slice(0, 18) || "customer";

      const channelName = `order-${safeUsername}`;

      const overwrites = [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
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

      const channel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: env.ORDERS_CATEGORY_ID || null,
        permissionOverwrites: overwrites,
      });

      const orderEmbed = new EmbedBuilder()
        .setTitle("🧾 طلب جديد")
        .setDescription(
          `**العميل:** <@${interaction.user.id}>\n` +
          `**المنتج:** ${product.name}\n` +
          `**السعر:** ${product.price} ريال\n` +
          `**المخزون المتبقي:** ${product.stock}\n` +
          `**الحالة:** 🟡 بانتظار الدفع`
        );

      await channel.send({
        content:
          `<@${interaction.user.id}>` +
          (env.STAFF_ROLE_ID
            ? ` <@&${env.STAFF_ROLE_ID}>`
            : ""),
        embeds: [
          orderEmbed,
          paymentEmbed(product),
        ],
        components: [orderButtons()],
      });

      await interaction.editReply({
        content:
          `✅ تم إنشاء الطلب بنجاح.\n` +
          `اذهب إلى: ${channel}`,
      });

      return;
    }

    // =========================
    // Buttons
    // =========================

    if (interaction.isButton()) {
      // إثبات الدفع
      if (interaction.customId === "proof") {
        await interaction.reply({
          content:
            "📤 ارفع الآن صورة أو ملف إثبات التحويل في هذه القناة.\n\n" +
            "بعد رفع الإثبات انتظر تأكيد الإدارة.",
          ephemeral: true,
        });

        return;
      }

      // =========================
      // Approve Payment
      // =========================

      if (interaction.customId === "approve") {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content: "❌ هذا الزر للإدارة فقط.",
            ephemeral: true,
          });

          return;
        }

        // نبحث عن اسم المنتج من الرسائل الموجودة بالقناة
        const messages = await interaction.channel.messages.fetch({
          limit: 20,
        });

        let product = null;

        for (const [, message] of messages) {
          for (const embed of message.embeds) {
            if (
              embed.title === "🧾 طلب جديد" &&
              embed.description
            ) {
              const match = embed.description.match(
                /\*\*المنتج:\*\* (.+)/
              );

              if (match) {
                const productName = match[1].trim();

                product = getProducts().find(
                  item => item.name === productName
                );

                break;
              }
            }
          }

          if (product) break;
        }

        if (!product) {
          await interaction.reply({
            content:
              "⚠️ تم تأكيد الدفع، لكن لم أستطع تحديد المنتج لتحديث المخزون.",
            ephemeral: true,
          });

          return;
        }

        const products = getProducts();
        const currentProduct = products.find(
          item => item.id === product.id
        );

        if (!currentProduct) {
          await interaction.reply({
            content: "❌ المنتج غير موجود في قاعدة البيانات.",
            ephemeral: true,
          });

          return;
        }

        if (Number(currentProduct.stock) <= 0) {
          await interaction.reply({
            content:
              "❌ لا يمكن تأكيد الطلب لأن المخزون أصبح 0.",
            ephemeral: true,
          });

          return;
        }

        currentProduct.stock =
          Number(currentProduct.stock) - 1;

        saveProducts(products);

        const embed = new EmbedBuilder()
          .setTitle("✅ تم تأكيد الدفع")
          .setDescription(
            `**الحالة:** 🟢 تم تأكيد الدفع\n` +
            `**المنتج:** ${currentProduct.name}\n` +
            `**بواسطة:** <@${interaction.user.id}>\n` +
            `**المخزون المتبقي:** ${currentProduct.stock}`
          )
          .setFooter({
            text: "Soork Store",
          });

        await interaction.channel.send({
          embeds: [embed],
        });

        await interaction.reply({
          content:
            "✅ تم تأكيد الدفع وتم خصم المنتج من المخزون.",
          ephemeral: true,
        });

        return;
      }

      // =========================
      // Reject Payment
      // =========================

      if (interaction.customId === "reject") {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content: "❌ هذا الزر للإدارة فقط.",
            ephemeral: true,
          });

          return;
        }

        const embed = new EmbedBuilder()
          .setTitle("❌ تم رفض إثبات الدفع")
          .setDescription(
            `**الحالة:** 🔴 تم رفض الإثبات\n` +
            `**بواسطة:** <@${interaction.user.id}>`
          )
          .setFooter({
            text: "Soork Store",
          });

        await interaction.channel.send({
          embeds: [embed],
        });

        await interaction.reply({
          content: "❌ تم رفض إثبات الدفع.",
          ephemeral: true,
        });

        return;
      }

      // =========================
      // Close Order
      // =========================

      if (interaction.customId === "close") {
        if (!isStaff(interaction)) {
          await interaction.reply({
            content: "❌ هذا الزر للإدارة فقط.",
            ephemeral: true,
          });

          return;
        }

        await interaction.reply(
          "🔒 سيتم إغلاق الطلب خلال 5 ثوانٍ."
        );

        setTimeout(() => {
          interaction.channel.delete().catch(() => {});
        }, 5000);

        return;
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply({
          content: "❌ حدث خطأ غير متوقع.",
          ephemeral: true,
        })
        .catch(() => {});
    }
  }
});

// =========================
// Login
// =========================

client.login(env.DISCORD_TOKEN);
