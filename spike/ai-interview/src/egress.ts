import {
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from 'livekit-server-sdk';
import { config } from './config.js';

/**
 * Start a server-side composite recording of the room (all participants mixed into one MP4)
 * and upload it to the configured S3-compatible bucket. Returns the egressId, or null if
 * recording is not configured. The `egress_ended` webhook fires when the file is finalized.
 */
export async function startRecording(room: string): Promise<string | null> {
  if (!config.s3) return null;

  const egress = new EgressClient(
    config.livekitHttpUrl,
    config.livekitApiKey,
    config.livekitApiSecret,
  );

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    // {time} is expanded by LiveKit so re-recordings don't collide.
    filepath: `interviews/${room}-{time}.mp4`,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: config.s3.accessKey,
        secret: config.s3.secretKey,
        bucket: config.s3.bucket,
        region: config.s3.region,
        endpoint: config.s3.endpoint,
        // Supabase Storage and most S3-compatible stores need path-style addressing.
        forcePathStyle: true,
      }),
    },
  });

  const info = await egress.startRoomCompositeEgress(room, { file: output });
  return info.egressId;
}
