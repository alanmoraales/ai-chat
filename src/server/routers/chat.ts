import { j, publicProcedure } from '../jstack';
import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: String(process.env.OPENAI_API_KEY),
});

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: String(process.env.PINECONE_API_KEY),
});

// Get the index
const index = pinecone.index(String(process.env.PINECONE_INDEX_NAME));

export const chatRouter = j.router({
  sendMessage: publicProcedure.post(async ({ c }) => {
    const { messages } = await c.req.json();

    // Get the latest user message
    const latestMessage = messages[messages.length - 1].content;

    // Query Pinecone for relevant context
    console.log('latestMessage', latestMessage);
    const queryResponse = await index.query({
      vector: await getEmbedding(latestMessage), // You'll need to implement this
      topK: 3,
      includeMetadata: true,
    });

    console.log('queryResponse', queryResponse);
    // Extract the relevant context from the query results
    const context = queryResponse.matches
      .map((match: any) => match.metadata?.text)
      .filter(Boolean)
      .join('\n\n');

    // Create a system message with the context
    const systemMessage = {
      role: 'system',
      content: `Use the following context to help answer the user's question:\n\n${context}\n\nIf the context doesn't help answer the question, just respond based on your general knowledge.`,
    };

    console.log('systemMessage', systemMessage);
    // Add the system message to the beginning of the messages array
    const messagesWithContext = [systemMessage, ...messages];

    const result = streamText({
      model: google('gemini-2.0-flash-exp'),
      // @ts-ignore
      messages: messagesWithContext,
    });
    return result.toDataStreamResponse();
  }),
});

// Helper function to get embeddings using OpenAI
async function getEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });

    return response.data[0]?.embedding ?? [];
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw new Error('Failed to generate embedding');
  }
}
