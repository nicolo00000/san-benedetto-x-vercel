import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { userFiles } from '@/lib/db/schema';
import { getAuth } from "@clerk/nextjs/server";
import { promises as fs } from 'fs';
import path from 'path';
import { desc, eq } from 'drizzle-orm';
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
    const { userId } = getAuth(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all files related to the user
    const files = await db.select()
      .from(userFiles)
      .where(eq(userFiles.userId, userId))
      .orderBy(desc(userFiles.createdAt));

    // Group files by their original audio file
    const groupedFiles = files.reduce((acc, file) => {
      const key = file.fileName.split('_')[0]; // Assuming the timestamp is the first part of the filename
      if (!acc[key]) {
        acc[key] = { sop: null, transcript: null };
      }
      if (file.fileType === 'sop') acc[key].sop = file;
      if (file.fileType === 'transcript') acc[key].transcript = file;
      return acc;
    }, {} as Record<string, { sop: any, transcript: any }>);

    // Process each group of files
    const processedFiles = await Promise.all(
      Object.values(groupedFiles).map(async ({ sop, transcript }) => {
        if (!sop || !transcript) return null; // Skip if we don't have both SOP and transcript
        const sopPath = path.resolve(sop.filePath);
        const transcriptPath = path.resolve(transcript.filePath);

        try {
          // Check if the SOP file exists
          let sopContent = '';
          try {
            await fs.access(sopPath);
            sopContent = await fs.readFile(sopPath, 'utf-8');
          } catch (err) {
            if (err instanceof Error && 'code' in err && (err as any).code === 'ENOENT') {
              console.warn(`SOP file not found: ${sopPath}`);
            } else {
              throw err; // Re-throw other errors
            }
          }

          // Check if the transcript file exists
          let transcriptContent = '';
          try {
            await fs.access(transcriptPath);
            transcriptContent = await fs.readFile(transcriptPath, 'utf-8');
          } catch (err) {
            if (err instanceof Error && 'code' in err && (err as any).code === 'ENOENT') {
              console.warn(`Transcript file not found: ${transcriptPath}`);
            } else {
              throw err; // Re-throw other errors
            }
          }

          // Generate summary if the transcript content exists
          const summary = transcriptContent
            ? await generateSummary(transcriptContent)
            : 'No transcript available for summary';

          return {
            id: sop.id,
            fileName: sop.fileName,
            machineName: sop.machineName,
            createdAt: sop.createdAt,
            content: sopContent || 'No SOP content available',
            summary
          };
        } catch (err) {
          console.error(`Error processing files: ${sopPath}, ${transcriptPath}`, err);
          return null;
        }
      })
    );

    // Filter out any null results and send the response
    const validFiles = processedFiles.filter(file => file !== null);
    return NextResponse.json(validFiles);
  } catch (error) {
    console.error('Error fetching user history:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}
