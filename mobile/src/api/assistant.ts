/**
 * Asking the repository assistant a question.
 *
 * The seam the model plugs into. For now every question gets the same honest answer,
 * after a pause long enough for the typing indicator to read as thinking rather than as a
 * flicker. When the assistant is real, this is the one function that changes: it will be
 * handed the repository and the conversation so far, and answer from them.
 */

export interface AssistantRepository {
  owner: string;
  name: string;
}

export interface AssistantTurn {
  role: 'user' | 'assistant';
  text: string;
}

export async function askAssistant(
  repository: AssistantRepository,
  question: string,
  _history: AssistantTurn[] = []
): Promise<string> {
  await wait(1200 + Math.random() * 700);
  return (
    `I'm not connected to a model yet, so I can't answer questions about ` +
    `${repository.owner}/${repository.name} just yet. Once I am, I'll be able to read its ` +
    `code, pull requests and issues and answer from them.`
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
