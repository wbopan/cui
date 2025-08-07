import { Response, NextFunction } from 'express';
import { RequestWithRequestId } from '@/types/express.js';

export function requestLogger(req: RequestWithRequestId, res: Response, next: NextFunction): void {
  const requestId = Math.random().toString(36).substring(7);
  req.requestId = requestId;
  
  // Commented out for now - keeping structure for future use
  // logger.debug('Incoming request', { 
  //   method: req.method, 
  //   url: req.url,
  //   requestId,
  //   headers: {
  //     'content-type': req.headers['content-type'],
  //     'user-agent': req.headers['user-agent']
  //   },
  //   query: req.query,
  //   ip: req.ip
  // });
  
  // Log response when finished
  res.on('finish', () => {
    // logger.debug('Request completed', {
    //   requestId,
    //   method: req.method,
    //   url: req.url,
    //   statusCode: res.statusCode,
    //   duration: Date.now() - startTime,
    //   contentLength: res.get('content-length')
    // });
  });
  
  next();
}