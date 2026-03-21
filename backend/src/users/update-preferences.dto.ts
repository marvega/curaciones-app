import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiProperty({ example: 14, description: 'Days threshold for patient inactivity alert' })
  @IsInt()
  @Min(1)
  @Max(365)
  inactivityThresholdDays: number;
}
