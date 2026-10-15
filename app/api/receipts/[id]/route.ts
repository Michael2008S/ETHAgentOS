import { owner, read } from '@/lib/agentos/store';
import { verifyReceipt } from '@/lib/agentos/engine';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { state } = await read(owner(request));
    const receipt = state.tasks.find(t => t.id === id)?.receipt;
    if (!receipt) return Response.json({ error: 'Receipt not found.' }, { status: 404 });
    return Response.json({ receipt, integrityValid: await verifyReceipt(receipt), verification: 'Local SHA-256 integrity only; not a signature, onchain receipt or DON attestation.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Unable to access receipt.' }, { status: 403 }); }
}
