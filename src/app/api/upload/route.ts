import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { db } from '@/lib/db';
import { userFiles } from '@/lib/db/schema';
import { auth } from "@clerk/nextjs/server";
import { Buffer } from 'buffer';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ALLOWED_EXTENSIONS = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];

function allowedFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext ? ALLOWED_EXTENSIONS.includes(ext) : false;
}

async function transcribeAudio(file: File, language: string): Promise<string> {
  console.log(`Transcribing audio file`);
  try {
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: language === 'it' ? 'it' : 'en',
    });
    console.log('Transcription successful');
    return transcription.text;
  } catch (error) {
    console.error('Error in audio transcription:', error);
    throw error;
  }
}

async function generateSOP(transcript: string, machineName: string, language: string): Promise<string> {
  console.log(`Generating SOP for ${machineName}`);
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that creates detailed Standard Operating Procedures (SOPs) for ${machineName} based on audio transcriptions.`
        },
        {
          role: "user",
          content: `Create a detailed SOP for ${machineName} based on this transcription: '${transcript}'. Include a title, purpose, scope, responsibilities, equipment/materials needed, safety precautions, and step-by-step procedures. The procedure should be written in ${language === 'it' ? 'Italian' : 'English'}.`
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    return completion.choices[0].message.content || 'No SOP generated';
  } catch (error) {
    console.error('Error in SOP generation:', error);
    throw error;
  }
}

async function generateSummary(transcript: string, language: string): Promise<string> {
  console.log('Generating summary of transcript');
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
          content: `Please summarize the following transcript in a concise manner in ${language === 'it' ? 'Italian' : 'English'}:\n\n${transcript}`
        }
      ],
      max_tokens: 150,
      temperature: 0.7,
    });

    return completion.choices[0].message.content || 'No summary generated';
  } catch (error) {
    console.error('Error in summary generation:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    console.log('POST request received');

    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const audio = formData.get('audio') as File;
    const machineName = formData.get('machine') as string;
    const language = formData.get('language') as string;

    if (!audio || !machineName || !language) {
      return NextResponse.json({ error: 'Missing audio, machine name, or language' }, { status: 400 });
    }

    if (!allowedFile(audio.name)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    // Read audio file content as binary data
    const audioBuffer = Buffer.from(await audio.arrayBuffer());

    // Transcribe the audio content
    const transcript = await transcribeAudio(audio, language);
    console.log('Transcription completed');

    // Generate SOP and Summary
    const sop = await generateSOP(transcript, machineName, language);
    console.log('SOP generated');
    const summary = await generateSummary(transcript, language);
    console.log('Summary generated');

    // Save file metadata and binary data in the database
    const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
    const filename = `${timestamp}_${audio.name}`;

    await db.insert(userFiles).values({
      userId,
      fileName: filename,
      fileType: 'audio',
      fileData: audioBuffer.toString('base64'), // Store audio data as Base64-encoded string
      machineName,
    });

    await db.insert(userFiles).values({
      userId,
      fileName: `${filename}_transcript`,
      fileType: 'transcript',
      fileData: Buffer.from(transcript).toString('base64'), // Store transcript as Base64-encoded string
      machineName,
    });

    await db.insert(userFiles).values({
      userId,
      fileName: `${filename}_sop`,
      fileType: 'sop',
      fileData: Buffer.from(sop).toString('base64'), // Store SOP as Base64-encoded string
      machineName,
    });

    return NextResponse.json({
      machine: machineName,
      transcript,
      summary,
      sop,
    });
  } catch (error) {
    console.error('Error processing upload:', error);
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 });
  }
}
