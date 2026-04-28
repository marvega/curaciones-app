import { IsString, IsEnum, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductType } from './product.entity';
import { CodeSystem } from './product-code.entity';

export class ProductCodeDto {
  @IsEnum(CodeSystem) codeSystem: CodeSystem;
  @IsString() code: string;
}

export class CreateProductDto {
  @IsString() name: string;
  @IsEnum(ProductType) type: ProductType;
  @IsString() packaging: string;
  @IsOptional() @IsBoolean() tracksExpiration?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProductCodeDto)
  codes?: ProductCodeDto[];
}
