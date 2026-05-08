import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:zelenka/repositories/user/abstract_user_repository.dart';
part 'register_event.dart';
part 'register_state.dart';

class RegisterBloc extends Bloc<RegisterEvent, RegisterState> {
  final AbstractUserRepository userRepository;
  RegisterBloc(this.userRepository) : super(RegisterInitial()) {
    on<RegisterSubmitEvent>((event, emit) async {
      emit(RegisterLoading());
      final result = await userRepository.register(
        event.login,
        event.email,
        event.password,
      );

      if (result is Map && result['success'] == true) {
        emit(RegisterSuccess());
      } else {
        final message = result is Map
            ? (result['message'] ?? 'Ошибка регистрации')
            : 'Ошибка регистрации';
        emit(RegisterFailure(message));
      }
    });
  }
}
