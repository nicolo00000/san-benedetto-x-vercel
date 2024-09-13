import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userFiles } from '@/lib/db/schema';
import { auth } from "@clerk/nextjs/server";
import { eq, desc } from 'drizzle-orm';
import OpenAI from 'openai';
export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

export async function GET(req: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch files related to the user
    const files = await db.select()
      .from(userFiles)
      .where(eq(userFiles.userId, userId))
      .orderBy(desc(userFiles.createdAt));

    const sopFiles = files.filter(file => file.fileType === 'sop');
    const transcriptFiles = files.filter(file => file.fileType === 'transcript');

    const combinedFiles = sopFiles.map(sopFile => {
      const relatedTranscript = transcriptFiles.find(
        transcriptFile => transcriptFile.fileName.split('_')[0] === sopFile.fileName.split('_')[0]
      );
      return {
        ...sopFile,
        transcript: relatedTranscript?.fileData.toString() || 'No transcript available',
        summary: relatedTranscript ? generateSummary(relatedTranscript.fileData.toString()) : 'No summary available'
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
