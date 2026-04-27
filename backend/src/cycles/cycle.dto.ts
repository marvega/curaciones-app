import { IsNumber, IsDateString, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpsertCycleDto {
  @ApiProperty({ example: 2026 })
  @IsNumber()
  year: number;

  @ApiProperty({ example: 3 })
  @IsNumber()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-03-31' })
  @IsDateString()
  endDate: string;
}

export class BulkUpsertCyclesDto {
  cycles: UpsertCycleDto[];
}
