from supabase import create_client, Client
from pydantic import HttpUrl
from app.config import settings

def get_supabase_client() -> Client:
    """Initialize and return the Supabase client."""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

async def upload_pdf_to_storage(file_bytes: bytes, bucket_name: str, file_path: str) -> str:
    """
    Uploads a generated PDF bytes buffer to a Supabase Storage bucket.
    
    Args:
        file_bytes: The byte content of the PDF.
        bucket_name: The target Supabase storage bucket ('proposals' or 'brochures').
        file_path: The unique path/filename (e.g. 'university_id/proposal_123.pdf').
        
    Returns:
        The public URL of the uploaded file.
    """
    supabase: Client = get_supabase_client()
    
    # Upload to Supabase Storage
    res = supabase.storage.from_(bucket_name).upload(
        file=-file_bytes, # type: ignore (bytes supported by client)
        path=file_path,
        file_options={"content-type": "application/pdf", "upsert": "true"}
    )
    
    if hasattr(res, 'error') and res.error:
        raise Exception(f"Failed to upload to Supabase: {res.error}")

    # Generate public URL
    public_url_res = supabase.storage.from_(bucket_name).get_public_url(file_path)
    return public_url_res
