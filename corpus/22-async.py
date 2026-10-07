import asyncio
async def work(n, d):
    await asyncio.sleep(d)
    return n * n
async def main():
    r = await asyncio.gather(*[work(i, 0.01 * (5 - i)) for i in range(5)])
    print(' '.join(map(str, r)))
asyncio.run(main())
