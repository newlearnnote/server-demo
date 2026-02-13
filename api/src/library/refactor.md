  종합 리팩토링 우선순위

  🔴 High Priority (즉시 개선 필요)

  1. LibraryPrivateService: pushLibrary,
  overwriteLibrary 예외 처리
  2. LibraryCommonService: 모든 메서드에 예외 처리 추가
  3. LibraryCommonService: isLibraryOwner 로직 수정

  🟡 Medium Priority (권장)

  4. LibraryPrivateService: createLibrary 보상 트랜잭션
  추가
  5. LibraryPrivateService: 중복 스트림 변환 로직 추출
  6. LibraryCommonService: getLibraryMetadata 로직 개선

  🟢 Low Priority (정리)

  7. 에러 메시지 한국어/영어 통일
  8. getLibraryByName의 예외를 NotFoundException으로
  변경