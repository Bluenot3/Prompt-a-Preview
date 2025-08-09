/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import {Chat, GoogleGenAI} from '@google/genai';
import {ChatState, marked, Playground} from './playground';

const EMPTY_CODE = `function setup() {
  // Setup code goes here.
  createCanvas(windowWidth, windowHeight);
}

function draw() {
  // Frame drawing code goes here.
  background(24, 24, 26);
}`;

const TEMPLATES = [
  {
    title: 'Interactive Particle System',
    description:
      'A swarm of colorful particles that react to your mouse. Click to create an explosion of new particles.',
    prompt:
      'Create a p5.js sketch of a particle system. The canvas should be black. Numerous small, circular particles should drift across the screen using Perlin noise for smooth, organic movement. Each particle should have a slowly shifting vibrant color (using HSB color mode is a good approach) and leave a faint trail. When the user clicks the mouse, it should trigger a radial explosion of 50 new particles originating from the mouse position.',
  },
  {
    title: 'Retro Asteroids',
    description:
      'A classic arcade game. Pilot a spaceship, shoot and destroy asteroids.',
    prompt:
      "Create a p5.js arcade game. The player controls a triangular spaceship in the center of the screen that can rotate left and right, and thrust forward. The ship can shoot bullets. Asteroids, represented as irregular polygons, enter from the screen edges and move across. If a bullet hits an asteroid, the asteroid breaks into two smaller asteroids. If a small asteroid is hit, it is destroyed. If the player's ship collides with an asteroid, the game is over. Keep track of the score.",
  },
  {
    title: 'Reaction-Diffusion',
    description:
      'A simulation of Turing patterns, creating organic, coral-like structures.',
    prompt:
      'Create a p5.js sketch that implements a Reaction-Diffusion system, specifically the Gray-Scott model. Use two chemicals, A and B. The canvas should be filled with chemical A initially, with a small patch of chemical B in the center. The simulation should update each frame based on diffusion rates and a feed/kill rate, creating organic, branching patterns. Visualize the concentration of one of the chemicals, for instance, mapping the concentration of chemical B to brightness.',
  },
  {
    title: 'Generative Mountain Ridge',
    description: 'A serene, endlessly scrolling mountain range at sunset.',
    prompt:
      'Create a p5.js sketch that generates a continuously scrolling 2D mountain range using Perlin noise. The sky should have a beautiful sunset gradient. The mountains in the foreground should be darker and move faster than the mountains in the background, creating a parallax effect. There should be at least 3 layers of mountain ridges.',
  },
];

function getCode(text: string) {
  const startMark = '```javascript';
  const codeStart = text.indexOf(startMark);
  let codeEnd = text.lastIndexOf('```');

  if (codeStart > -1) {
    if (codeEnd < 0) {
      codeEnd = undefined;
    }
    return text.substring(codeStart + startMark.length, codeEnd);
  }
  return '';
}

const SYSTEM_INSTRUCTIONS = `you're an extremely proficient creative coding agent, and can code effects, games, generative art.
write javascript code assuming it's in a live p5js environment.
return the code block.
you can include a short paragraph explaining your reasoning and the result in human readable form.
there can be no external dependencies: all functions must be in the returned code.
make extra sure that all functions are either declared in the code or part of p5js.
the user can modify the code, go along with the user's changes.`;

document.addEventListener('DOMContentLoaded', async (event) => {
  const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
  let chat: Chat | null = null;

  const rootElement = document.querySelector('#root')! as HTMLElement;

  const playground = new Playground();
  rootElement.appendChild(playground);

  playground.sendMessageHandler = async (
    input: string,
    role: string,
    code: string,
    codeHasChanged: boolean,
  ) => {
    if (!chat) {
      chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {systemInstruction: SYSTEM_INSTRUCTIONS},
      });
    }

    const {text} = playground.addMessage('assistant', '');
    let prompt = '';

    if (role.toUpperCase() === 'USER' && codeHasChanged) {
      prompt = `I have updated the code to:\n\`\`\`javascript\n${code}\n\`\`\`\n\nMy request is: ${input}`;
    } else if (role.toUpperCase() === 'SYSTEM') {
      prompt = `The p5.js sketch returned an error: "${input}". Please fix the code.`;
    } else {
      prompt = input;
    }

    playground.setChatState(ChatState.GENERATING);
    text.innerHTML = '...';
    let accumulatedText = '';
    let newCode = '';

    try {
      const stream = await chat.sendMessageStream({message: prompt});

      playground.setChatState(ChatState.CODING);

      for await (const chunk of stream) {
        accumulatedText += chunk.text;
        const p5Code = getCode(accumulatedText);

        const explanation = accumulatedText.replace(
          '```javascript' + p5Code + '```',
          '',
        );

        text.innerHTML = await marked.parse(explanation);
        playground.scrollToTheEnd();
      }
      newCode = accumulatedText;
    } catch (e: any) {
      console.error('API Error:', e);
      const {text} = playground.addMessage('error', '');
      text.innerHTML = await marked.parse(
        e.message || 'An unknown error occurred.',
      );
    }

    if (text.innerHTML.trim().length === 0) {
      text.innerHTML = 'Done';
    }

    const p5Code = getCode(newCode);
    if (p5Code.trim().length > 0) {
      playground.setCode(p5Code);
    } else {
      // If there was an error, don't say "no new code"
      if (!newCode.startsWith('API request failed')) {
        playground.addMessage('SYSTEM', 'There is no new code update.');
      }
    }
    playground.setChatState(ChatState.IDLE);
  };

  playground.resetHandler = async () => {
    // Reset the local chat session
    chat = null;
  };

  playground.templates = TEMPLATES;
  playground.setDefaultCode(EMPTY_CODE);
  playground.setCode(EMPTY_CODE);
  playground.showTemplates();
});
