import OpenAI from 'openai';
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Upload a document to OpenAI's File API for efficient processing
 */
export async function uploadDocumentToOpenAI(
  content: string, 
  filename: string
): Promise<string> {
  try {
    console.log(`📤 [OPENAI] Uploading document: ${filename}`);
    
    // Create a blob from the content
    const blob = new Blob([content], { type: 'text/markdown' });
    
    // Create a File object
    const file = new File([blob], filename, { type: 'text/markdown' });
    
    // Upload to OpenAI
    const uploadedFile = await openai.files.create({
      file: file,
      purpose: 'assistants',
    });
    
    console.log(`✅ [OPENAI] Document uploaded successfully: ${uploadedFile.id}`);
    
    return uploadedFile.id;
  } catch (error) {
    console.error('❌ [OPENAI] Failed to upload document:', error);
    throw new Error(`Failed to upload document to OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Verify that an OpenAI file is still accessible
 */
export async function verifyOpenAIFile(fileId: string): Promise<boolean> {
  try {
    console.log(`🔍 [OPENAI] Verifying file accessibility: ${fileId}`);
    
    const file = await openai.files.retrieve(fileId);
    
    // Check if file exists and is in a valid state
    const isAccessible = file && file.status === 'processed';
    
    console.log(`${isAccessible ? '✅' : '❌'} [OPENAI] File ${fileId} accessibility: ${isAccessible}`);
    
    return isAccessible;
  } catch (error) {
    console.warn(`⚠️ [OPENAI] File verification failed for ${fileId}:`, error);
    return false;
  }
}

/**
 * Delete an OpenAI file
 */
export async function deleteOpenAIFile(fileId: string): Promise<boolean> {
  try {
    console.log(`🗑️ [OPENAI] Deleting file: ${fileId}`);
    
    await openai.files.delete(fileId);
    
    console.log(`✅ [OPENAI] File deleted successfully: ${fileId}`);
    
    return true;
  } catch (error) {
    console.warn(`⚠️ [OPENAI] File deletion failed for ${fileId}:`, error);
    return false;
  }
}

/**
 * List all OpenAI files
 */
export async function listOpenAIFiles(): Promise<OpenAI.FileObject[]> {
  try {
    const response = await openai.files.list();
    return response.data;
  } catch (error) {
    console.error('❌ [OPENAI] Failed to list files:', error);
    throw new Error(`Failed to list OpenAI files: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get OpenAI file content
 */
export async function getOpenAIFileContent(fileId: string): Promise<string> {
  try {
    console.log(`📥 [OPENAI] Retrieving file content: ${fileId}`);
    
    const response = await openai.files.content(fileId);
    const content = await response.text();
    
    console.log(`✅ [OPENAI] File content retrieved: ${content.length} characters`);
    
    return content;
  } catch (error) {
    console.error(`❌ [OPENAI] Failed to retrieve file content for ${fileId}:`, error);
    throw new Error(`Failed to retrieve OpenAI file content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}