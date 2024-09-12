import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userFiles } from '@/lib/db/schema';
import { auth } from "@clerk/nextjs/server";
import { promises as fs } from 'fs';
import path from 'path';
import { desc, eq } from 'drizzle-orm';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Function to generate summary from transcript
async function generateSummary(transcript: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that summarizes transcripts concisely."
        },
        {
          role: "user",
          content: `Please summarize the following transcript in a concise manner:\n\n${transcript}`
        }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });
    return completion.choices[0].message?.content || 'No summary generated';
  } catch (error) {
    console.error('Error in summary generation:', error);
    return 'Error generating summary';
  }
}

// GET route handler
export async function GET(req: NextRequest) {
  try {
    // Authenticate user
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all files related to the user
    const files = await db.select()
      .from(userFiles)
      .where(eq(userFiles.userId, userId))
      .orderBy(desc(userFiles.createdAt));

    // Filter SOP and transcript files
    const sopFiles = files.filter(file => file.fileType === 'sop');
    const transcriptFiles = files.filter(file => file.fileType === 'transcript');

    // Process SOP files and add content
    const sopFilesWithContent = await Promise.all(
      sopFiles.map(async (file) => {
        const sopPath = path.resolve(file.filePath);
        try {
          const content = await fs.readFile(sopPath, 'utf-8');
          return { ...file, content };
        } catch (err) {
          console.error(`Error reading SOP file at ${sopPath}:`, err);
          return { ...file, content: 'Error reading SOP file' };
        }
      })
    );

    // Process transcript files, generate summaries, and add content
    const transcriptFilesWithSummary = await Promise.all(
      transcriptFiles.map(async (file) => {
        const transcriptPath = path.resolve(file.filePath);
        try {
          const content = await fs.readFile(transcriptPath, 'utf-8');
          const summary = await generateSummary(content);
          return { ...file, content, summary };
        } catch (err) {
          console.error(`Error reading transcript file at ${transcriptPath}:`, err);
          return { ...file, content: 'Error reading transcript file', summary: 'Unable to generate summary' };
        }
      })
    );

    // Combine SOP and transcript information
    const combinedFiles = sopFilesWithContent.map(sopFile => {
      const relatedTranscript = transcriptFilesWithSummary.find(
        transcriptFile => transcriptFile.fileName.split('_')[0] === sopFile.fileName.split('_')[0]
      );
      return {
        ...sopFile,
        transcriptContent: relatedTranscript?.content || 'No transcript available',
        summary: relatedTranscript?.summary || 'No summary available'
      };
    });

    return NextResponse.json(combinedFiles);
  } catch (error) {
    console.error('Error fetching user history:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}