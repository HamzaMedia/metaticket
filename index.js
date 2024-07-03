const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle, InteractionType, ChannelType, ActivityType } = require('discord.js');
const config = require('./config.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`${client.user.tag} is online!`);
  client.user.setPresence({
    activities: [{ name: config.activity, type: ActivityType.Listening }],
    status: config.status
  });
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith(config.prefix)) return;

  const args = message.content.slice(config.prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'setup') {
    const setupEmbed = new EmbedBuilder()
      .setTitle('Meta Development Ticket Sistemi')
      .setDescription('**Meta Development** destek kanalına hoşgeldiniz. Bu kanal üzerinden destek talebi açarak bizden her konuda destek alabilirsiniz.')
      .setColor('9370DB');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('📩 Ticket Oluştur')
        .setStyle(ButtonStyle.Success)
    );

    await message.channel.send({ embeds: [setupEmbed], components: [row] });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'create_ticket') {
    const modal = new ModalBuilder()
      .setCustomId('ticket_reason')
      .setTitle('Ticket Sebebi')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason_input')
            .setLabel('Ticket açma sebebiniz nedir?')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.type !== InteractionType.ModalSubmit) return;

  if (interaction.customId === 'ticket_reason') {
    const reason = interaction.fields.getTextInputValue('reason_input');

    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: config.ticketCategoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: config.ticketModeratorRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageChannels
          ]
        }
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle('Ticket Açıldı')
      .setDescription(`Sebep: ${reason}`)
      .setColor('0000FF')
      .addFields(
        { name: 'Açan Kişi', value: `<@${interaction.user.id}>` },
        { name: 'Yetkili', value: `<@&${config.ticketModeratorRoleId}>` }
      );

    const closeButton = new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Ticket Kapat')
      .setStyle(ButtonStyle.Danger);

    const addMemberButton = new ButtonBuilder()
      .setCustomId('add_member')
      .setLabel('Üye Ekle')
      .setStyle(ButtonStyle.Success);

    const removeMemberButton = new ButtonBuilder()
      .setCustomId('remove_member')
      .setLabel('Üye Çıkar')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(closeButton, addMemberButton, removeMemberButton);
    await ticketChannel.send({ embeds: [embed], components: [row] });

    // Ticket açan kişiyi kanala yönlendirme
    await interaction.reply({ content: `Ticket kanalınız oluşturuldu: ${ticketChannel}`, ephemeral: true });

    const logChannel = await client.channels.fetch(config.logChannelId);
    await logChannel.send(`\`\`\`Ticket açıldı: ${interaction.user.tag} sebep: ${reason}\`\`\``);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const ticketChannel = interaction.channel;

  if (interaction.customId === 'close_ticket') {
    const logChannel = await client.channels.fetch(config.logChannelId);
    const closeEmbed = new EmbedBuilder()
      .setTitle('Ticket Kapatıldı')
      .setDescription(`Ticket kapatıldı: ${interaction.user.tag}`)
      .addFields(
        { name: 'Kapatılan Ticket', value: `<#${ticketChannel.id}>` },
        { name: 'Açan Kişi', value: `<@${interaction.user.id}>` }
      )
      .setColor('0000FF');
    await logChannel.send({ content: '`', embeds: [closeEmbed], content: '`' });

    await ticketChannel.delete();
  }

  if (interaction.customId === 'add_member' || interaction.customId === 'remove_member') {
    const action = interaction.customId === 'add_member' ? 'add' : 'remove';
    const modal = new ModalBuilder()
      .setCustomId(`member_${action}`)
      .setTitle(action === 'add' ? 'Üye Ekle' : 'Üye Çıkar')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('member_id')
            .setLabel('Üye ID\'si veya @kullanıcı')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.type !== InteractionType.ModalSubmit) return;

  const ticketChannel = interaction.channel;

  if (interaction.customId === 'member_add' || interaction.customId === 'member_remove') {
    const memberId = interaction.fields.getTextInputValue('member_id').replace(/[<@!>]/g, '');
    const member = await interaction.guild.members.fetch(memberId).catch(() => null);

    if (!member) {
      await interaction.reply({ content: 'Geçersiz üye ID\'si veya kullanıcı.', ephemeral: true });
      return;
    }

    if (interaction.customId === 'member_add') {
      await ticketChannel.permissionOverwrites.edit(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });
      await interaction.reply({ content: `${member} ticket kanalına eklendi.`, ephemeral: true });
    } else if (interaction.customId === 'member_remove') {
      await ticketChannel.permissionOverwrites.edit(member.id, {
        ViewChannel: false
      });
      await interaction.reply({ content: `${member} ticket kanalından çıkarıldı.`, ephemeral: true });
    }
  }
});

client.on('messageCreate', async message => {
  if (message.channel.parentId === config.ticketCategoryId && !message.author.bot) {
    // Mesajları normal şekilde gönderme
    const logChannel = await client.channels.fetch(config.logChannelId);
    await logChannel.send(`\`\`\`Mesaj: ${message.author.tag} - ${message.content}\`\`\``);
  }
});

client.login(config.token);
