# Weekly market-data verification

주간 PDF를 만들거나 수정할 때 미국 2년물(`UST2Y`)과 호주 10년물(`AU10Y`)은 유료 API를 사용하지 않는다.

1. 주간 PDF는 일요일 제작을 기본으로 하며, 가장 최근에 끝난 거래일의 종가를 사용한다. 장중 가격은 사용하지 않는다.
2. Investing.com의 날짜별 Historical Data 공개 화면에서 종가와 실제 거래 기준일을 확인한다.
3. 같은 거래일의 TradingView 일봉 종가와 대조한다. 차트의 장중 현재값이 아니라 해당 날짜의 `C` 값을 확인한다.
4. 두 값의 차이가 2bp 이하이면 날짜별 종가를 명확히 제공하는 Investing.com 값을 보고서 값으로 채택한다.
5. 차이가 2bp를 초과하면 값을 넣지 말고 제3의 공개 시장화면으로 재검증한 뒤 사용자에게 차이를 알린다.
6. 검증 결과를 `data/weekly-market-overrides.json`에 기록한다. `verified_at`, `trade_date`, `price_basis: "previous-close"`, 양쪽 값, 차이(bp), URL을 모두 남긴다.
7. 공개 화면이 장중으로 표시되면 값을 기록하지 않는다. 일요일에는 직전 금요일 종가를 사용하고, 휴장일이면 그 이전 최근 거래일 종가를 사용한다.
8. TradingView 데이터를 백엔드에서 자동 스크래핑하거나 적재하지 않는다. 사람에게 표시된 공개 화면을 교차검증 용도로만 사용한다.
9. PDF를 실제 렌더링해 해외 표의 값·기준일과 하단의 `해외금리 전일 종가 2중 대조` 문구를 확인한다.

검증 페이지:

- UST2Y primary: https://www.investing.com/rates-bonds/u.s.-2-year-bond-yield-historical-data
- UST2Y check: https://www.tradingview.com/symbols/TVC-US02Y/
- AU10Y primary: https://www.investing.com/rates-bonds/australia-10-year-bond-yield-historical-data
- AU10Y check: https://www.tradingview.com/symbols/TVC-AU10Y/
