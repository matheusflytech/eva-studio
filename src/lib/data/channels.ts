export interface ChannelDef {
  id: string;
  name: string;
}

export const CHANNELS: ChannelDef[] = [
  { id: "whatsapp", name: "WhatsApp Business" },
  { id: "instagram", name: "Instagram Direct" },
  { id: "webchat", name: "Webchat do site" },
  { id: "email", name: "E-mail" },
];
