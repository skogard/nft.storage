import decorateAdditionalCalculatedValues, {
  calcuateGrowthRate,
} from '../statsUtils'

const fakeData = {
  ok: true,
  data: {
    deals_size_total: 249523372029443,
    uploads_past_7_total: 2011366,
    uploads_nft_total: 685866,
    uploads_remote_total: 11077834,
    deals_total: 34959,
    uploads_car_total: 17711308,
    uploads_multipart_total: 1456388,
    uploads_blob_total: 12420729,
  },
}

describe('Stats Utils unit tests', () => {
  it('Should calculate growth rate correctly', () => {
    expect(parseFloat(calcuateGrowthRate(100, 50))).toBe(100.0)
  })

  it('Should decorate upload totals correctly, given fake data', () => {
    const stats = decorateAdditionalCalculatedValues(fakeData.data)
    expect(stats.growthRate).toBe('4.87')
    expect(stats.totalUploads).toBe(43352125)
  })
})
