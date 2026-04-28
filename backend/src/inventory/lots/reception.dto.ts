import { IsInt, IsString, IsOptional, IsDateString, Min } from 'class-validator';

export class ReceptionDto {
  @IsInt() productId: number;
  @IsInt() establishmentId: number;
  @IsOptional() @IsString() lotCode?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsDateString() receivedAt: string;
  @IsInt() @Min(1) quantity: number;
  @IsOptional() @IsString() notes?: string;
}
