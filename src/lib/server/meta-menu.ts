// Menu do bloco de Captura no WhatsApp oficial. A Cloud API aceita até 3
// botões ou até 10 linhas numa lista; acima disso vai texto numerado, que o
// motor aceita pelo número ou pelo rótulo. Antes ia sempre como botões e o que
// passava de 3 opções sumia.
export function corpoDoMenu(to: string, text: string, options: { id: string; label: string }[]) {
  if (options.length <= 3) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: { buttons: options.map((o) => ({ type: "reply", reply: { id: o.id, title: o.label.slice(0, 20) } })) },
      },
    };
  }
  if (options.length <= 10) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text },
        action: { button: "Ver opções", sections: [{ rows: options.map((o) => ({ id: o.id, title: o.label.slice(0, 24) })) }] },
      },
    };
  }
  const numerado = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
  return { messaging_product: "whatsapp", to, type: "text", text: { body: `${text}\n\n${numerado}` } };
}
