require("dotenv").config();

const {
  Client, GatewayIntentBits, Partials, REST, Routes,
  SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType,
  StringSelectMenuBuilder, AttachmentBuilder
} = require("discord.js");
const fs=require("fs"), path=require("path");

const env=process.env;
if(!env.DISCORD_TOKEN || !env.GUILD_ID) {
  console.error("ضع DISCORD_TOKEN و GUILD_ID في .env");
  process.exit(1);
}
const dataDir=path.join(__dirname,"..","data");
const productsFile=path.join(dataDir,"products.json");
if(!fs.existsSync(productsFile)) fs.writeFileSync(productsFile,"[]");

const products=()=>JSON.parse(fs.readFileSync(productsFile,"utf8"));
const client=new Client({intents:[GatewayIntentBits.Guilds],partials:[Partials.Channel]});

const commands=[
 new SlashCommandBuilder().setName("store").setDescription("عرض متجر Soork Store"),
 new SlashCommandBuilder().setName("products").setDescription("عرض المنتجات"),
 new SlashCommandBuilder().setName("setup").setDescription("إرسال لوحة المتجر").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(x=>x.toJSON());

function storeEmbed(){
 return new EmbedBuilder().setTitle(`🛒 ${env.STORE_NAME||"Soork Store"}`)
 .setDescription("اختر المنتج من القائمة لفتح طلب خاص.\\nبعد إنشاء الطلب ستظهر لك بيانات تحويل الراجحي، ثم ترفع إثبات الدفع.")
 .setFooter({text:"Soork Store • Payment & Orders"});
}
function menu(){
 const ps=products().slice(0,25);
 return new StringSelectMenuBuilder().setCustomId("select_product").setPlaceholder("اختر المنتج")
 .addOptions(ps.length?ps.map(p=>({label:`${p.name} - ${p.price} ريال`,description:String(p.description||"").slice(0,100),value:p.id})):[{label:"لا توجد منتجات",value:"none"}]);
}
function paymentEmbed(p){
 return new EmbedBuilder().setTitle("💳 طريقة الدفع — تحويل الراجحي")
 .setDescription(
 `**البنك:** ${env.RAJHI_BANK_NAME||"مصرف الراجحي"}\\n`+
 `**اسم صاحب الحساب:** ${env.RAJHI_ACCOUNT_NAME||"غير مضبوط"}\\n`+
 `**الآيبان:** \`${env.RAJHI_IBAN||"غير مضبوط"}\`\\n`+
 `**المبلغ المطلوب:** **${p.price} ريال**\\n\\n`+
 "بعد التحويل اضغط **إرسال إثبات الدفع** وارفع صورة/ملف التحويل داخل نفس الطلب.\\n"+
 "⚠️ لا يعتبر الطلب مدفوعًا حتى يتم تأكيده من الإدارة."
 ).setFooter({text:"Soork Store"});
}
function orderButtons(){
 return new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("proof").setLabel("إرسال إثبات الدفع").setEmoji("📤").setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId("approve").setLabel("تأكيد الدفع").setEmoji("✅").setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId("reject").setLabel("رفض الإثبات").setEmoji("❌").setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId("close").setLabel("إغلاق الطلب").setEmoji("🔒").setStyle(ButtonStyle.Secondary)
 );
}
function isStaff(interaction){
 return !!(env.STAFF_ROLE_ID && interaction.member?.roles?.cache?.has(env.STAFF_ROLE_ID));
}

client.once("ready",async()=>{
 const rest=new REST({version:"10"}).setToken(env.DISCORD_TOKEN);
 await rest.put(Routes.applicationGuildCommands(client.user.id,env.GUILD_ID),{body:commands});
 console.log(`Logged in as ${client.user.tag}`);
});

client.on("interactionCreate",async i=>{
 try{
  if(i.isChatInputCommand()){
   if(["store","setup"].includes(i.commandName)){
    await i.reply({embeds:[storeEmbed()],components:[new ActionRowBuilder().addComponents(menu())]});
   } else if(i.commandName==="products"){
    const text=products().map(p=>`**${p.name}** — ${p.price} ريال\\n${p.description||""}`).join("\\n\\n")||"لا توجد منتجات.";
    await i.reply({content:text,ephemeral:true});
   }
   return;
  }

  if(i.isStringSelectMenu() && i.customId==="select_product"){
   const p=products().find(x=>x.id===i.values[0]);
   if(!p){await i.reply({content:"المنتج غير موجود.",ephemeral:true});return;}
   await i.deferReply({ephemeral:true});
   const name=`order-${i.user.username.toLowerCase().replace(/[^a-z0-9-_]/g,"").slice(0,18)||"customer"}`;
   const overwrites=[
    {id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]}
   ];
   if(env.STAFF_ROLE_ID) overwrites.push({id:env.STAFF_ROLE_ID,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]});
   const ch=await i.guild.channels.create({name,type:ChannelType.GuildText,parent:env.ORDERS_CATEGORY_ID||null,permissionOverwrites:overwrites});
   const order=new EmbedBuilder().setTitle("🧾 طلب جديد").setDescription(`**العميل:** <@${i.user.id}>\\n**المنتج:** ${p.name}\\n**السعر:** ${p.price} ريال\\n**الحالة:** 🟡 بانتظار الدفع`);
   await ch.send({content:`<@${i.user.id}>${env.STAFF_ROLE_ID?` <@&${env.STAFF_ROLE_ID}>`:""}`,embeds:[order,paymentEmbed(p)],components:[orderButtons()]});
   await i.editReply({content:`✅ تم إنشاء الطلب: <#${ch.id}>`});
   return;
  }

  if(i.isButton()){
   if(i.customId==="proof"){
    await i.reply({content:"📤 ارفع الآن صورة أو ملف إثبات التحويل في هذه القناة، ثم اكتب `تم`.",ephemeral:true});
    return;
   }
   if(["approve","reject"].includes(i.customId)){
    if(!isStaff(i)){await i.reply({content:"❌ هذا الزر للإدارة فقط.",ephemeral:true});return;}
    const status=i.customId==="approve"?"🟢 تم تأكيد الدفع":"🔴 تم رفض الإثبات";
    const emb=new EmbedBuilder().setTitle(i.customId==="approve"?"✅ تم تأكيد الدفع":"❌ تم رفض إثبات الدفع")
      .setDescription(`**الحالة:** ${status}\\n**بواسطة:** <@${i.user.id}>`);
    await i.channel.send({embeds:[emb]});
    await i.reply({content:"تم تحديث حالة الطلب.",ephemeral:true});
    return;
   }
   if(i.customId==="close"){
    if(!isStaff(i) && !i.channel.name.startsWith("order-")){await i.reply({content:"ليس لديك صلاحية.",ephemeral:true});return;}
    await i.reply("🔒 سيتم إغلاق الطلب خلال 5 ثوانٍ.");
    setTimeout(()=>i.channel.delete().catch(()=>{}),5000);
   }
  }
 }catch(e){
  console.error(e);
  if(!i.replied&&!i.deferred) await i.reply({content:"حدث خطأ غير متوقع.",ephemeral:true}).catch(()=>{});
 }
});

client.login(env.DISCORD_TOKEN);
