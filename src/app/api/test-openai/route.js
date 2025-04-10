import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET() {
  try {
    console.log('Testing OpenAI API connection');
    
    // Check if API key is in environment
    const apiKey = process.env.OPENAI_API_KEY;
    console.log('API Key defined:', !!apiKey);
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not found in environment variables' },
        { status: 500 }
      );
    }
    
    // Create OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey
    });
    
    // Make a simple test request
    console.log('Making test request to OpenAI API');
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say hello!' }
      ]
    });
    
    console.log('Received response from OpenAI API');
    
    return NextResponse.json({
      success: true,
      response: response.choices[0].message.content
    });
  } catch (error) {
    console.error('Error testing OpenAI API:', error);
    return NextResponse.json(
      { 
        error: 'Failed to call OpenAI API', 
        message: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}