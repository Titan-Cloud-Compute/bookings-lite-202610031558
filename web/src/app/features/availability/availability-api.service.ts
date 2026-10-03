import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';
import type {
  AvailabilityWindowDto,
  AvailabilityWindowInput,
  BlockedSlotDto,
  CreateBlockRequest,
  SlotDto,
} from '@contracts/availability';

/** Story: set-availability — thin wrapper over /api/availability. */
@Injectable({ providedIn: 'root' })
export class AvailabilityApiService {
  private readonly api = inject(ApiClient);

  listWindows(): Promise<AvailabilityWindowDto[]> {
    return this.api.get<AvailabilityWindowDto[]>('availability/windows');
  }

  replaceWindows(windows: AvailabilityWindowInput[]): Promise<AvailabilityWindowDto[]> {
    return this.api.put<AvailabilityWindowDto[]>('availability/windows', { windows });
  }

  listBlocks(): Promise<BlockedSlotDto[]> {
    return this.api.get<BlockedSlotDto[]>('availability/blocks');
  }

  createBlock(body: CreateBlockRequest): Promise<BlockedSlotDto> {
    return this.api.post<BlockedSlotDto>('availability/blocks', body);
  }

  deleteBlock(id: string): Promise<{ ok: true }> {
    return this.api.delete<{ ok: true }>(`availability/blocks/${encodeURIComponent(id)}`);
  }

  slots(serviceId: string, date: string): Promise<SlotDto[]> {
    return this.api.get<SlotDto[]>(
      `availability/slots?serviceId=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
    );
  }
}
