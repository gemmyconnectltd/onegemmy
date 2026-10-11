// Where "talk to a person" goes. Kept in one place so the Support menu and anything else that offers it agree.
export const SUPPORT_WHATSAPP_URL = "https://chat.whatsapp.com/KdYZ26ywxvK3x0clmLWedK?mode=gi_t";
export const SUPPORT_EMAIL = "support@pesaa.io";
/** Fired to open the Pesaa AI panel (optionally with a question); AskPesaaAI listens for it. */
export const ASK_AI_EVENT = "pesaa-ai:ask";
/** Fired by the AI panel whenever it opens or closes (`detail.open`), so the floating buttons can step aside. */
export const AI_STATE_EVENT = "pesaa-ai:state";
