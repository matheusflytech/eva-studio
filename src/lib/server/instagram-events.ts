import { isEmojiOnly, type InboundKind } from "@/lib/server/triggers";

export interface InstagramMessageLike {
  text?: string;
  attachments?: { type?: string; payload?: { url?: string } }[];
  reply_to?: { mid?: string; story?: { id?: string; url?: string } };
}

export interface ClassifiedInstagramMessage {
  kind: InboundKind;
  storyId?: string;
  storyUrl?: string;
  isReaction: boolean;
}

/**
 * O Instagram manda resposta a story, reação a story e menção em story no
 * mesmo campo "messages" de uma DM comum. A diferença está no reply_to.story
 * (resposta/reação) e no anexo do tipo story_mention (menção).
 */
export function classifyInstagramMessage(message: InstagramMessageLike): ClassifiedInstagramMessage {
  const mention = message.attachments?.find((a) => a.type === "story_mention");
  if (mention) return { kind: "story_mention", storyUrl: mention.payload?.url, isReaction: false };

  const story = message.reply_to?.story;
  if (story) {
    return { kind: "story_reply", storyId: story.id, storyUrl: story.url, isReaction: isEmojiOnly(message.text) };
  }
  return { kind: "dm", isReaction: false };
}
