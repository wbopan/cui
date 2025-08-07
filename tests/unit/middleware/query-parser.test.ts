import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { queryParser } from '@/middleware/query-parser';

describe('queryParser middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = { query: {} };
    res = {};
    next = vi.fn();
  });

  it('should convert string numbers to numbers', () => {
    req.query = {
      limit: '10',
      offset: '20',
      price: '99.99'
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      limit: 10,
      offset: 20,
      price: 99.99
    });
    expect(next).toHaveBeenCalled();
  });

  it('should convert boolean strings to booleans', () => {
    req.query = {
      archived: 'true',
      pinned: 'false',
      hasContinuation: 'TRUE',
      active: 'FALSE'
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      archived: true,
      pinned: false,
      hasContinuation: true,
      active: false
    });
    expect(next).toHaveBeenCalled();
  });

  it('should preserve non-convertible strings', () => {
    req.query = {
      name: 'test',
      projectPath: '/path/to/project',
      sortBy: 'created'
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      name: 'test',
      projectPath: '/path/to/project',
      sortBy: 'created'
    });
    expect(next).toHaveBeenCalled();
  });

  it('should handle empty strings', () => {
    req.query = {
      empty: '',
      notEmpty: 'value'
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      empty: '',
      notEmpty: 'value'
    });
    expect(next).toHaveBeenCalled();
  });

  it('should handle array values', () => {
    req.query = {
      ids: ['1', '2', '3'],
      flags: ['true', 'false', 'maybe']
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      ids: [1, 2, 3],
      flags: [true, false, 'maybe']
    });
    expect(next).toHaveBeenCalled();
  });

  it('should handle mixed types', () => {
    req.query = {
      limit: '50',
      archived: 'true',
      projectPath: '/test',
      offset: '0',
      name: 'My Session'
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      limit: 50,
      archived: true,
      projectPath: '/test',
      offset: 0,
      name: 'My Session'
    });
    expect(next).toHaveBeenCalled();
  });

  it('should handle negative numbers', () => {
    req.query = {
      temperature: '-10.5',
      depth: '-100'
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      temperature: -10.5,
      depth: -100
    });
    expect(next).toHaveBeenCalled();
  });

  it('should not convert invalid numbers', () => {
    req.query = {
      notANumber: '123abc',
      partial: '12.34.56',
      infinity: 'Infinity'
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      notANumber: '123abc',
      partial: '12.34.56',
      infinity: 'Infinity'
    });
    expect(next).toHaveBeenCalled();
  });

  it('should handle undefined query object', () => {
    req.query = undefined as any;

    queryParser(req as Request, res as Response, next);

    expect(req.query).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should handle non-string values in query', () => {
    req.query = {
      alreadyNumber: 42 as any,
      alreadyBoolean: true as any,
      nullValue: null as any,
      undefinedValue: undefined as any
    };

    queryParser(req as Request, res as Response, next);

    expect(req.query).toEqual({
      alreadyNumber: 42,
      alreadyBoolean: true,
      nullValue: null,
      undefinedValue: undefined
    });
    expect(next).toHaveBeenCalled();
  });
});