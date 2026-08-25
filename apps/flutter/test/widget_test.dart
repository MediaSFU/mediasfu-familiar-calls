import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mediasfu_familiar_call/main.dart';

void main() {
  testWidgets('shows identity onboarding without a meeting ID field', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    await tester.pumpWidget(const FamiliarCallApp());
    await tester.pumpAndSettle();
    expect(find.text('Your calls, without meeting codes.'), findsOneWidget);
    expect(find.textContaining('Meeting ID'), findsNothing);
  });
}
