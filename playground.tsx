/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import {html, LitElement} from 'lit';
import {customElement, property, query, state} from 'lit/decorators.js';
// tslint:disable-next-line:ban-malformed-import-paths
import hljs from 'highlight.js';
import {classMap} from 'lit/directives/class-map.js';
import {Marked} from 'marked';
import {markedHighlight} from 'marked-highlight';

/** Markdown formatting function with syntax hilighting */
export const marked = new Marked(
  markedHighlight({
    async: true,
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang, info) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, {language}).value;
    },
  }),
);

const ICON_BUSY = html`<svg
  class="rotating"
  xmlns="http://www.w3.org/2000/svg"
  height="24px"
  viewBox="0 -960 960 960"
  width="24px"
  fill="currentColor">
  <path
    d="M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q17 0 28.5 11.5T520-840q0 17-11.5 28.5T480-800q-133 0-226.5 93.5T160-480q0 133 93.5 226.5T480-160q133 0 226.5-93.5T800-480q0-17 11.5-28.5T840-520q17 0 28.5 11.5T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Z" />
</svg>`;
const ICON_EDIT = html`<svg
  xmlns="http://www.w3.org/2000/svg"
  height="16px"
  viewBox="0 -960 960 960"
  width="16px"
  fill="currentColor">
  <path
    d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l528-527q12-11 26.5-17t30.5-6q16 0 31 6t26 18l55 56q12 11 17.5 26t5.5 30q0 16-5.5 30.5T817-647L290-120H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z" />
</svg>`;

const p5jsCdnUrl =
  'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.3/p5.min.js';

/**
 * Chat state enum to manage the current state of the chat interface.
 */
export enum ChatState {
  IDLE,
  GENERATING,
  THINKING,
  CODING,
}

/**
 * Chat tab enum to manage the current selected tab in the chat interface.
 */
enum ChatTab {
  GEMINI,
  CODE,
}

type Template = {
  title: string;
  description: string;
  prompt: string;
};

/**
 * Playground component for p5js.
 */
@customElement('gdm-playground')
export class Playground extends LitElement {
  @query('#anchor') anchor;
  @query('#sidebar') sidebar: HTMLElement;
  @query('#resizer') resizer: HTMLElement;
  private readonly codeSyntax = document.createElement('div');

  @state() chatState = ChatState.IDLE;
  @state() isRunning = true;
  @state() selectedChatTab = ChatTab.GEMINI;
  @state() inputMessage = '';
  @state() code = '';
  @state() messages: HTMLElement[] = [];
  @state() codeHasChanged = false;
  @state() codeNeedsReload = false;
  @state() isTemplatesModalOpen = false;

  @property({type: Array}) templates: Template[] = [];

  private defaultCode = '';
  private readonly previewFrame: HTMLIFrameElement =
    document.createElement('iframe');
  private lastError = '';

  sendMessageHandler?: CallableFunction;
  resetHandler?: CallableFunction;

  constructor() {
    super();
    this.previewFrame.classList.add('preview-iframe');
    this.previewFrame.setAttribute('allowTransparency', 'true');
    this.codeSyntax.classList.add('code-syntax');

    window.addEventListener('message', (msg) => {
      if (msg.data && typeof msg.data === 'string') {
        try {
          const message = JSON.parse(msg.data).message;
          this.runtimeErrorHandler(message);
        } catch (e) {
          /* Not a JSON message, ignore. */
        }
      }
    });
  }

  createRenderRoot() {
    return this;
  }

  firstUpdated() {
    const resizer = this.resizer;
    const sidebar = this.sidebar;
    const resize = (e: MouseEvent) => {
      sidebar.style.flexBasis = `${e.clientX}px`;
    };
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.addEventListener('mousemove', resize);
      document.addEventListener('mouseup', () => {
        document.removeEventListener('mousemove', resize);
      });
    });
  }

  showTemplates() {
    this.isTemplatesModalOpen = true;
  }

  setDefaultCode(code: string) {
    this.defaultCode = code;
  }

  async setCode(code: string) {
    this.code = code;
    this.runCode(code);
    this.codeHasChanged = false;
    this.codeNeedsReload = false;

    this.codeSyntax.innerHTML = await marked.parse(
      '```javascript\n' + code + '\n```',
    );
  }

  setChatState(state: ChatState) {
    this.chatState = state;
  }

  runCode(code: string) {
    this.lastError = '';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>p5.js Sketch</title>
          <style>
              body { margin: 0; overflow: hidden; }
              main { display: flex; justify-content: center; align-items: center; }
          </style>
          <script src="${p5jsCdnUrl}"><\/script>
          <script>
            window.addEventListener('message', (event) => {
                if (event.data === 'stop' && typeof noLoop === 'function') { noLoop(); }
                else if (event.data === 'resume' && typeof loop === 'function') { loop(); }
            }, false);
            window.onerror = function(message, source, lineno, colno, error) {
              parent.postMessage(JSON.stringify({ message: message.toString() }), '*');
              return true;
            };
            // Override console.error to also post messages
            const originalConsoleError = console.error;
            console.error = function(...args) {
              originalConsoleError.apply(console, args);
              const message = args.map(arg => arg.toString()).join(' ');
              parent.postMessage(JSON.stringify({ message }), '*');
            };
          <\/script>
      </head>
      <body>
          <main></main>
          <script>
            try {
              ${code}
            } catch (error) {
              console.error(error);
            }
          <\/script>
      </body>
      </html>
    `;

    this.previewFrame.setAttribute('srcdoc', htmlContent);
    this.codeNeedsReload = false;
    this.isRunning = true;
  }

  runtimeErrorHandler(errorMessage: string) {
    if (this.lastError !== errorMessage) {
      this.addMessage('system-ask', errorMessage);
      this.lastError = errorMessage;
    }
  }

  setInputField(message: string) {
    this.inputMessage = message.trim();
  }

  addMessage(role: string, message: string) {
    const div = document.createElement('div');
    div.classList.add('turn', `role-${role.trim()}`);

    const thinkingDetails = document.createElement('details');
    thinkingDetails.classList.add('hidden'); // Always hidden now
    div.append(thinkingDetails);

    const text = document.createElement('div');
    text.className = 'text';
    text.textContent = message;
    div.append(text);

    if (role === 'system-ask') {
      const btn = document.createElement('button');
      btn.textContent = 'Improve';
      div.appendChild(btn);
      btn.addEventListener('click', () => {
        div.removeChild(btn);
        this.sendMessageAction(message, 'SYSTEM');
      });
    }

    this.messages.push(div);
    this.requestUpdate();
    this.scrollToTheEnd();
    return {text};
  }

  scrollToTheEnd() {
    this.anchor?.scrollIntoView({behavior: 'smooth', block: 'end'});
  }

  async sendMessageAction(message?: string, role?: string) {
    if (this.chatState !== ChatState.IDLE) return;
    this.chatState = ChatState.GENERATING;

    const msg = (message ?? this.inputMessage).trim();
    this.inputMessage = '';

    if (msg.length === 0) {
      this.chatState = ChatState.IDLE;
      return;
    }

    const msgRole = role ? role.toLowerCase() : 'user';

    if (msgRole === 'user' && msg) {
      this.addMessage(msgRole, msg);
    }

    if (this.sendMessageHandler) {
      await this.sendMessageHandler(msg, msgRole, this.code, this.codeHasChanged);
      this.codeHasChanged = false;
    }

    this.chatState = ChatState.IDLE;
  }

  private playAction() {
    if (this.isRunning) return;
    if (this.codeNeedsReload) {
      this.runCode(this.code);
    } else {
      this.previewFrame.contentWindow.postMessage('resume', '*');
    }
    this.isRunning = true;
  }

  private stopAction() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.previewFrame.contentWindow.postMessage('stop', '*');
  }

  private newAction() {
    this.isTemplatesModalOpen = true;
  }

  private clearAction() {
    this.setCode(this.defaultCode);
    this.messages = [];
    this.codeHasChanged = true;
    this.resetHandler?.();
  }

  private async codeEditedAction(code: string) {
    if (this.chatState !== ChatState.IDLE) return;
    this.code = code;
    this.codeHasChanged = true;
    this.codeNeedsReload = true;
    this.codeSyntax.innerHTML = await marked.parse('```javascript\n' + code + '\n```');
  }

  private async inputKeyDownAction(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessageAction();
    }
  }

  private reloadCodeAction() {
    this.runCode(this.code);
  }

  private selectTemplate(prompt: string) {
    this.isTemplatesModalOpen = false;
    this.clearAction();
    this.addMessage('user', prompt);
    this.sendMessageAction(prompt, 'user');
  }

  renderTemplatesModal() {
    if (!this.isTemplatesModalOpen) return html``;

    return html`
      <div id="templates-modal" @click=${() => (this.isTemplatesModalOpen = false)}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <h1>Welcome to the P5.js AI Playground</h1>
          <p>
            Your AI creative coding partner. Start from scratch or choose a
            template to begin.
          </p>
          <div class="templates-grid">
            ${this.templates.map(
              (template) => html`
                <div class="template-card">
                  <h3>${template.title}</h3>
                  <p>${template.description}</p>
                  <button @click=${() => this.selectTemplate(template.prompt)}>
                    Create
                  </button>
                </div>
              `,
            )}
          </div>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <div class="playground">
        ${this.renderTemplatesModal()}
        <div id="sidebar" class="sidebar">
          <div class="selector">
            <button
              class=${classMap({'selected-tab': this.selectedChatTab === ChatTab.GEMINI})}
              @click=${() => (this.selectedChatTab = ChatTab.GEMINI)}>
              Gemini
            </button>
            <button
              class=${classMap({ 'selected-tab': this.selectedChatTab === ChatTab.CODE })}
              @click=${() => (this.selectedChatTab = ChatTab.CODE)}>
              Code ${this.codeHasChanged ? ICON_EDIT : ''}
            </button>
          </div>
          <div id="chat" class=${classMap({tabcontent: true, showtab: this.selectedChatTab === ChatTab.GEMINI})}>
            <div class="chat-messages">${this.messages}<div id="anchor"></div></div>
            <div class="footer">
              <div id="chatStatus" class=${classMap({hidden: this.chatState === ChatState.IDLE})}>
                ${this.chatState !== ChatState.IDLE ? html`${ICON_BUSY} Gemini is working...` : ''}
              </div>
              <div id="inputArea">
                <textarea
                  id="messageInput"
                  .value=${this.inputMessage}
                  @input=${(e: InputEvent) => (this.inputMessage = (e.target as HTMLInputElement).value)}
                  @keydown=${this.inputKeyDownAction}
                  placeholder="Type a message to create or modify the sketch..."
                  rows="1"
                ></textarea>
                <button
                  id="sendButton"
                  class=${classMap({disabled: this.chatState !== ChatState.IDLE})}
                  @click=${() => this.sendMessageAction()}>
                  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px">
                    <path d="M120-160v-640l760 320-760 320Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div id="editor" class=${classMap({tabcontent: true, showtab: this.selectedChatTab === ChatTab.CODE})}>
            <div class="code-container">
              ${this.codeSyntax}
              <textarea
                class="code-editor"
                .value=${this.code}
                .readonly=${this.chatState !== ChatState.IDLE}
                @input=${(e: InputEvent) => this.codeEditedAction((e.target as HTMLTextAreaElement).value)}
              ></textarea>
            </div>
          </div>
        </div>
        <div id="resizer"></div>
        <div class="main-container">
          ${this.previewFrame}
          <div class="toolbar">
            <button id="reloadCode" class=${classMap({'needs-reload': this.codeNeedsReload})} @click=${this.reloadCodeAction}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" /></svg>
              Reload
            </button>
            <button class="play-button" class=${classMap({disabled: this.isRunning})} @click=${this.playAction}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M320-200v-560l440 280-440 280Z" /></svg>
            </button>
            <button class="stop-button" class=${classMap({disabled: !this.isRunning})} @click=${this.stopAction}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M320-320h320v-320H320v320Z" /></svg>
            </button>
            <button id="new" @click=${this.newAction}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z" /></svg>
              New
            </button>
            <button id="clear" @click=${this.clearAction}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960"><path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" /></svg>
              Clear
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
