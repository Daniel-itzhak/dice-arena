import { Body } from '@nestjs/common';
import { ApiBody, type SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

export function toOpenApiSchema(schema: z.ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' }) as SchemaObject;
}

/**
 * Validates the request body against a shared Zod schema and documents the same schema in Swagger,
 * so the runtime contract and the API docs cannot drift apart.
 */
export function ZodBody(schema: z.ZodType): ParameterDecorator {
  const validateBody = Body(new ZodValidationPipe(schema));
  const documentBody = ApiBody({ schema: toOpenApiSchema(schema, 'input') });

  return (target, propertyKey, parameterIndex) => {
    validateBody(target, propertyKey, parameterIndex);
    if (propertyKey === undefined) {
      return;
    }
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
    if (descriptor) {
      documentBody(target, propertyKey, descriptor);
    }
  };
}
