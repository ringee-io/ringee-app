import { Injectable, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { apiConfiguration } from "@ringee/configuration";

@Injectable()
export class WhatsappClient {
  private readonly baseUrl: string;
  private readonly logger = new Logger(WhatsappClient.name);

  constructor(private readonly http: HttpService) {
    const phoneNumberId = apiConfiguration.WHATSAPP_PHONE_ID;
    this.baseUrl = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${apiConfiguration.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    };
  }

  private handleError(context: string, err: any): never {
    const statusCode = err.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

    const data = err.response?.data || err.message || err;
    const details =
      typeof data === "object" ? JSON.stringify(data) : String(data);

    this.logger.error(`[${context}] Error: ${details}`);

    throw new HttpException(
      {
        message: `WhatsApp API error in ${context}`,
        error: data?.error?.message || data,
        status: statusCode,
      },
      statusCode,
    );
  }

  async sendText(to: string, text: string) {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("sendText", err);
    }
  }

  async sendImage(to: string, imageUrl: string, caption?: string) {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link: imageUrl, caption },
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("sendImage", err);
    }
  }

  async sendTemplate(to: string, templateName: string, languageCode = "en_US") {
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("sendTemplate", err);
    }
  }

  async sendInteractiveButtons(params: {
    to: string;
    header?: {
      type: "text" | "image" | "video" | "document";
      text?: string;
      mediaUrl?: string;
      filename?: string;
    };
    bodyText: string;
    footerText?: string;
    buttons: { id: string; title: string }[];
  }) {
    const { to, header, bodyText, footerText, buttons } = params;

    if (!buttons?.length || buttons.length > 3) {
      throw new HttpException(
        "Debe incluir entre 1 y 3 botones",
        HttpStatus.BAD_REQUEST,
      );
    }

    const interactive: any = {
      type: "button",
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    };

    if (header) {
      switch (header.type) {
        case "text":
          interactive.header = { type: "text", text: header.text };
          break;
        case "image":
          interactive.header = {
            type: "image",
            image: { link: header.mediaUrl },
          };
          break;
        case "video":
          interactive.header = {
            type: "video",
            video: { link: header.mediaUrl },
          };
          break;
        case "document":
          interactive.header = {
            type: "document",
            document: {
              link: header.mediaUrl,
              filename: header.filename || "file.pdf",
            },
          };
          break;
        default:
          throw new HttpException(
            "Tipo de header inválido. Usa text, image, video o document.",
            HttpStatus.BAD_REQUEST,
          );
      }
    }

    if (footerText) interactive.footer = { text: footerText };

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("sendInteractiveButtons", err);
    }
  }

  async markAsRead(messageId: string) {
    const payload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("markAsRead", err);
    }
  }

  async sendTypingIndicator(messageId: string) {
    const payload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: {
        type: "text",
      },
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("sendTypingIndicator", err);
    }
  }

  async sendCarousel(params: {
    to: string;
    bodyText?: string;
    footerText?: string;
    cards: {
      header?: {
        type: "image" | "video" | "document";
        mediaUrl: string;
        filename?: string;
      };
      bodyText: string;
      buttons: { id: string; title: string }[];
    }[];
  }) {
    const { to, bodyText, footerText, cards } = params;

    if (!cards?.length) {
      throw new HttpException(
        "Debe incluir al menos 1 tarjeta",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (cards.length > 10) {
      throw new HttpException(
        "El carrusel admite un máximo de 10 tarjetas",
        HttpStatus.BAD_REQUEST,
      );
    }

    const cardObjects = cards.map((card) => {
      const cardData: any = {
        body: { text: card.bodyText },
        action: {
          buttons: card.buttons.map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.title },
          })),
        },
      };

      if (card.header) {
        switch (card.header.type) {
          case "image":
            cardData.header = {
              type: "image",
              image: { link: card.header.mediaUrl },
            };
            break;
          case "video":
            cardData.header = {
              type: "video",
              video: { link: card.header.mediaUrl },
            };
            break;
          case "document":
            cardData.header = {
              type: "document",
              document: {
                link: card.header.mediaUrl,
                filename: card.header.filename || "file.pdf",
              },
            };
            break;
          default:
            throw new HttpException(
              "Tipo de header inválido en una tarjeta. Usa image, video o document.",
              HttpStatus.BAD_REQUEST,
            );
        }
      }

      return cardData;
    });

    const interactive: any = {
      type: "carousel",
      cards: cardObjects,
    };

    if (bodyText) interactive.body = { text: bodyText };
    if (footerText) interactive.footer = { text: footerText };

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("sendCarousel", err);
    }
  }

  async sendInteractiveList(params: {
    to: string;
    headerText?: string;
    bodyText: string;
    footerText?: string;
    buttonText: string;
    sections: {
      title: string;
      rows: {
        id: string;
        title: string;
        description?: string;
      }[];
    }[];
  }) {
    const { to, headerText, bodyText, footerText, buttonText, sections } =
      params;

    if (!sections?.length) {
      throw new HttpException(
        "Debe incluir al menos 1 sección",
        HttpStatus.BAD_REQUEST,
      );
    }

    if (sections.length > 10) {
      throw new HttpException(
        "Solo se permiten hasta 10 secciones",
        HttpStatus.BAD_REQUEST,
      );
    }

    const totalRows = sections.reduce((acc, s) => acc + s.rows.length, 0);
    if (totalRows > 10) {
      throw new HttpException(
        "Solo se permiten hasta 10 filas en total",
        HttpStatus.BAD_REQUEST,
      );
    }

    const interactive: any = {
      type: "list",
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections: sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
          })),
        })),
      },
    };

    if (headerText) interactive.header = { type: "text", text: headerText };
    if (footerText) interactive.footer = { text: footerText };

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive,
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("sendInteractiveList", err);
    }
  }

  async sendReaction(params: { to: string; messageId: string; emoji: string }) {
    const { to, messageId, emoji } = params;

    if (!to || !messageId || !emoji) {
      throw new HttpException(
        "Parámetros requeridos: to, messageId y emoji.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "reaction",
      reaction: {
        message_id: messageId,
        emoji,
      },
    };

    try {
      const response = await firstValueFrom(
        this.http.post(this.baseUrl, payload, { headers: this.headers }),
      );
      return response.data;
    } catch (err) {
      this.handleError("sendReaction", err);
    }
  }
}
