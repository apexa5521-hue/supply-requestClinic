import sys, os, ssl, asyncio
import edge_tts, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
async def main(text, voice, out, rate):
    com = edge_tts.Communicate(text, voice, rate=rate, proxy=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy'))
    await com.save(out)
asyncio.run(main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else '+0%'))
