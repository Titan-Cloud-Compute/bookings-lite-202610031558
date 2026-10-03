import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';
import type { CreateServiceRequest, ServiceDto } from '@contracts/services';

/** Story: create-service — thin wrapper over /api/services. */
@Injectable({ providedIn: 'root' })
export class ServicesApiService {
  private readonly api = inject(ApiClient);

  /** The signed-in provider's own services. */
  listMine(): Promise<ServiceDto[]> {
    return this.api.get<ServiceDto[]>('services/mine');
  }

  /** Bookable catalog (all active services). */
  listBookable(): Promise<ServiceDto[]> {
    return this.api.get<ServiceDto[]>('services');
  }

  create(body: CreateServiceRequest): Promise<ServiceDto> {
    return this.api.post<ServiceDto>('services', body);
  }
}
